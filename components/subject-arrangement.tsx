"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type DragEvent } from "react";
import { CustomSubjectModal } from "@/components/custom-subject-modal";
import { SubjectSearchModal } from "@/components/subject-search-modal";
import {
  CUSTOM_GROUP_FALLBACK,
  FALLBACK_BADGE,
  TRACK_BADGE,
  TRACK_ORDER,
  TRACK_TEXT,
  TrackBadge,
  trackRank,
  type SubjectDraft,
  type SubjectRow,
} from "@/components/subject-shared";
import {
  completionIssues,
  type ArrangementInput,
  type CompletionIssue,
  type SurveyArrangement,
} from "@/lib/arrangement";
import type { CurriculumCatalog } from "@/lib/curriculum";
import { catalogRows } from "@/lib/subject-rows";

type SortKey = "group" | "track" | "subject";
type SortDirection = "asc" | "desc";
type SortState = { key: SortKey; direction: SortDirection };

type SubjectGroup = {
  id: number;
  name: string;
  subjectIds: string[];
  pickCount: number | null;
};

type SubjectFormState = { mode: "add" } | { mode: "edit"; id: string };

const SUBJECT_DRAG_TYPE = "application/x-schoolapply-subjects";

const COLUMNS: { key: SortKey; label: string; width: string }[] = [
  { key: "group", label: "교과(군)", width: "w-40" },
  { key: "track", label: "과목구분", width: "w-25" },
  { key: "subject", label: "과목명", width: "" },
];

const TIE_BREAK: SortKey[] = ["group", "track", "subject"];

function validPickCount(group: SubjectGroup) {
  return group.pickCount !== null && group.pickCount >= 1 ? group.pickCount : null;
}

function toArrangementInput(
  groups: SubjectGroup[],
  customRows: SubjectRow[],
  nextGroupId: number,
): ArrangementInput {
  return {
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name.trim() || `그룹 ${group.id}`,
      pickCount: validPickCount(group) ?? 1,
      subjectIds: group.subjectIds,
    })),
    customSubjects: customRows.map(({ id, subject, group, track }) => ({ id, subject, group, track })),
    nextGroupId,
  };
}

function formatSavedTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function compareRows(left: SubjectRow, right: SubjectRow, sort: SortState) {
  const direction = sort.direction === "asc" ? 1 : -1;
  const keys = [sort.key, ...TIE_BREAK.filter((key) => key !== sort.key)];
  for (const key of keys) {
    const result = left[key].localeCompare(right[key], "ko");
    if (result !== 0) return result * (key === sort.key ? direction : 1);
  }
  return 0;
}

export function SubjectArrangement({
  catalog,
  surveyId,
  initialArrangement,
  removedSubjectCount,
}: {
  catalog: CurriculumCatalog;
  surveyId: string;
  initialArrangement: SurveyArrangement | null;
  removedSubjectCount: number;
}) {
  const router = useRouter();
  const [sort, setSort] = useState<SortState | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [groups, setGroups] = useState<SubjectGroup[]>(() => initialArrangement?.groups ?? []);
  const [nextGroupId, setNextGroupId] = useState(() => initialArrangement?.nextGroupId ?? 1);
  const [dropTargetId, setDropTargetId] = useState<number | null>(null);
  const [searchGroupId, setSearchGroupId] = useState<number | null>(null);
  const [customRows, setCustomRows] = useState<SubjectRow[]>(
    () => initialArrangement?.customSubjects.map((custom) => ({ ...custom, custom: true })) ?? [],
  );
  const [subjectForm, setSubjectForm] = useState<SubjectFormState | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    initialArrangement
      ? JSON.stringify(
          toArrangementInput(
            initialArrangement.groups,
            initialArrangement.customSubjects.map((custom) => ({ ...custom, custom: true })),
            initialArrangement.nextGroupId,
          ),
        )
      : null,
  );
  const [savedAt, setSavedAt] = useState(initialArrangement?.updatedAt ?? null);
  const [saving, setSaving] = useState<"draft" | "next" | null>(null);
  const [saveError, setSaveError] = useState("");
  const [issues, setIssues] = useState<CompletionIssue[] | null>(null);
  const [missingNotice, setMissingNotice] = useState(removedSubjectCount);
  const currentInput = toArrangementInput(groups, customRows, nextGroupId);
  const currentSnapshot = JSON.stringify(currentInput);
  const dirty = savedSnapshot === null ? groups.length > 0 || customRows.length > 0 : currentSnapshot !== savedSnapshot;
  const liveIssues = issues === null ? null : completionIssues(currentInput);
  const issueGroupIds = new Set(liveIssues?.map((issue) => issue.groupId));

  useEffect(() => {
    if (!dirty) return;
    function warnBeforeLeave(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", warnBeforeLeave);
    return () => window.removeEventListener("beforeunload", warnBeforeLeave);
  }, [dirty]);
  const searchGroup = groups.find((group) => group.id === searchGroupId);
  const baseRows = useMemo(() => catalogRows(catalog), [catalog]);
  const rows = useMemo(() => [...baseRows, ...customRows], [baseRows, customRows]);
  const groupOptions = useMemo(() => {
    const names = [...new Set(baseRows.map((row) => row.group))];
    return names.includes(CUSTOM_GROUP_FALLBACK) ? names : [...names, CUSTOM_GROUP_FALLBACK];
  }, [baseRows]);
  const editingRow =
    subjectForm?.mode === "edit" ? customRows.find((row) => row.id === subjectForm.id) : undefined;
  const groupNameBySubject = useMemo(() => {
    const names = new Map<string, string>();
    for (const group of groups) {
      for (const subjectId of group.subjectIds) names.set(subjectId, group.name);
    }
    return names;
  }, [groups]);
  const visibleRows = useMemo(
    () => (sort ? [...rows].sort((left, right) => compareRows(left, right, sort)) : rows),
    [rows, sort],
  );

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function createGroup() {
    setGroups((current) => [
      ...current,
      { id: nextGroupId, name: `그룹 ${nextGroupId}`, subjectIds: [], pickCount: 1 },
    ]);
    setNextGroupId((current) => current + 1);
  }

  function renameGroup(id: number, name: string) {
    setGroups((current) => current.map((group) => (group.id === id ? { ...group, name } : group)));
  }

  function restoreEmptyGroupName(id: number) {
    setGroups((current) =>
      current.map((group) => (group.id === id && !group.name.trim() ? { ...group, name: `그룹 ${id}` } : group)),
    );
  }

  function changePickCount(id: number, value: string) {
    const count = value === "" ? null : Math.floor(Number(value));
    setGroups((current) => current.map((group) => (group.id === id ? { ...group, pickCount: count } : group)));
  }

  function restoreInvalidPickCount(id: number) {
    setGroups((current) =>
      current.map((group) =>
        group.id === id && validPickCount(group) === null ? { ...group, pickCount: 1 } : group,
      ),
    );
  }

  function deleteGroup(id: number) {
    setGroups((current) => current.filter((group) => group.id !== id));
  }

  function assignSubjects(groupId: number, subjectIds: string[]) {
    setGroups((current) =>
      current.map((group) => {
        const others = group.subjectIds.filter((id) => !subjectIds.includes(id));
        return { ...group, subjectIds: group.id === groupId ? [...others, ...subjectIds] : others };
      }),
    );
    setSelectedIds((current) => new Set([...current].filter((id) => !subjectIds.includes(id))));
  }

  function createCustomSubject(draft: SubjectDraft) {
    const id = `custom-${crypto.randomUUID()}`;
    setCustomRows((current) => [...current, { id, ...draft, custom: true }]);
    return id;
  }

  function updateCustomSubject(id: string, draft: SubjectDraft) {
    setCustomRows((current) => current.map((row) => (row.id === id ? { ...row, ...draft } : row)));
  }

  function deleteCustomSubject(row: SubjectRow) {
    const groupName = groupNameBySubject.get(row.id);
    const message = groupName
      ? `"${row.subject}"을(를) 삭제하면 ${groupName}에서도 빠집니다. 삭제할까요?`
      : `"${row.subject}"을(를) 삭제할까요?`;
    if (!window.confirm(message)) return;
    setCustomRows((current) => current.filter((item) => item.id !== row.id));
    setGroups((current) =>
      current.map((group) => ({ ...group, subjectIds: group.subjectIds.filter((id) => id !== row.id) })),
    );
    setSelectedIds((current) => new Set([...current].filter((id) => id !== row.id)));
  }

  function removeSubject(groupId: number, subjectId: string) {
    setGroups((current) =>
      current.map((group) =>
        group.id === groupId ? { ...group, subjectIds: group.subjectIds.filter((id) => id !== subjectId) } : group,
      ),
    );
  }

  function handleRowDragStart(event: DragEvent<HTMLTableRowElement>) {
    const subjectIds = rows.filter((row) => selectedIds.has(row.id)).map((row) => row.id);
    event.dataTransfer.setData(SUBJECT_DRAG_TYPE, JSON.stringify(subjectIds));
    event.dataTransfer.effectAllowed = "move";

    const preview = document.createElement("div");
    preview.textContent = `${subjectIds.length}과목`;
    preview.className = "fixed -top-20 rounded-lg bg-violet-700 px-3 py-1.5 text-sm font-medium text-white";
    document.body.append(preview);
    event.dataTransfer.setDragImage(preview, 0, 0);
    setTimeout(() => preview.remove());
  }

  function handleGroupDragOver(event: DragEvent<HTMLLIElement>, groupId: number) {
    if (!event.dataTransfer.types.includes(SUBJECT_DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTargetId(groupId);
  }

  function handleGroupDragLeave(event: DragEvent<HTMLLIElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDropTargetId(null);
  }

  function handleGroupDrop(event: DragEvent<HTMLLIElement>, groupId: number) {
    event.preventDefault();
    setDropTargetId(null);
    const subjectIds = JSON.parse(event.dataTransfer.getData(SUBJECT_DRAG_TYPE) || "[]") as string[];
    if (subjectIds.length > 0) assignSubjects(groupId, subjectIds);
  }

  async function save(complete: boolean) {
    setSaveError("");
    if (complete) {
      const found = completionIssues(currentInput);
      setIssues(found);
      if (found.length > 0) return;
    }
    setSaving(complete ? "next" : "draft");
    try {
      const response = await fetch(`/api/surveys/${surveyId}/arrangement`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arrangement: currentInput, complete }),
      });
      const data = (await response.json()) as {
        arrangement?: SurveyArrangement;
        error?: string;
        issues?: CompletionIssue[];
      };
      if (!response.ok || !data.arrangement) {
        if (data.issues) setIssues(data.issues);
        setSaveError(data.error ?? "저장하지 못했습니다.");
        return;
      }
      setSavedSnapshot(currentSnapshot);
      setSavedAt(data.arrangement.updatedAt);
      setMissingNotice(0);
      if (complete) router.push(`/surveys/${surveyId}/form`);
    } catch {
      setSaveError("저장하지 못했습니다. 네트워크 연결을 확인해 주세요.");
    } finally {
      setSaving(null);
    }
  }

  function toggleSort(key: SortKey) {
    setSort((current) => {
      if (current?.key !== key) return { key, direction: "asc" };
      return { key, direction: current.direction === "asc" ? "desc" : "asc" };
    });
  }

  return (
    <div className="grid w-full grid-cols-1 items-start gap-6 lg:grid-cols-2">
      {missingNotice > 0 ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 lg:col-span-2">
          과목 목록에서 사라진 과목 {missingNotice}개가 그룹에서 제외되었습니다. 확인 후 저장해 주세요.
        </p>
      ) : null}
      <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <header className="flex items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">전체 선택과목</h2>
            <p className="mt-1 text-sm text-zinc-500">
              {catalog.subjectCount}과목
              {customRows.length > 0 ? ` · 직접 추가 ${customRows.length}과목` : null}
              {selectedIds.size > 0 ? (
                <>
                  <span className="ml-2 font-medium text-violet-700">{selectedIds.size}과목 선택됨</span>
                  <button
                    type="button"
                    onClick={() => setSelectedIds(new Set())}
                    className="ml-2 rounded-md border border-zinc-300 px-2 py-0.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                  >
                    전체 선택 해제
                  </button>
                </>
              ) : null}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setSubjectForm({ mode: "add" })}
              className="rounded-lg border border-violet-200 px-3 py-1.5 text-sm font-medium text-violet-700 hover:bg-violet-50"
            >
              과목 추가
            </button>
            <button
              type="button"
              onClick={() => setSort(null)}
              disabled={sort === null}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 enabled:hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-300"
            >
              정렬 초기화
            </button>
          </div>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-medium text-zinc-500">
              <tr>
                {COLUMNS.map((column) => {
                  const active = sort?.key === column.key;
                  const indicator = active ? (sort.direction === "asc" ? "↑" : "↓") : "";
                  return (
                    <th
                      key={column.key}
                      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                      className={`${column.width} px-2 py-1.5 font-medium`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(column.key)}
                        className="flex w-full items-center gap-1 rounded-md px-2 py-1 text-left hover:bg-zinc-100 hover:text-zinc-800"
                      >
                        {column.label}
                        <span className="text-zinc-400" aria-hidden="true">
                          {indicator}
                        </span>
                      </button>
                    </th>
                  );
                })}
                <th className="w-16 px-4 py-2.5 text-center font-medium">선택</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const selected = selectedIds.has(row.id);
                const groupName = groupNameBySubject.get(row.id);
                return (
                  <tr
                    key={row.id}
                    draggable={selected}
                    onDragStart={handleRowDragStart}
                    className={
                      selected
                        ? "cursor-grab border-b border-violet-100 bg-violet-50 active:cursor-grabbing"
                        : "border-b border-zinc-100"
                    }
                  >
                    <td className="border-r border-zinc-100 px-4 py-2 text-zinc-900">{row.group}</td>
                    <td className="border-r border-zinc-100 px-4 py-2 text-zinc-600">
                      <TrackBadge track={row.track} />
                    </td>
                    <td className="border-r border-zinc-100 px-4 py-2 text-zinc-800">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0">
                          {row.subject}
                          {row.custom ? (
                            <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-500">
                              직접 추가
                            </span>
                          ) : null}
                          {groupName ? <span className="ml-2 text-xs text-zinc-400">{groupName}</span> : null}
                        </span>
                        {row.custom ? (
                          <span className="ml-auto flex shrink-0 gap-1">
                            <button
                              type="button"
                              onClick={() => setSubjectForm({ mode: "edit", id: row.id })}
                              aria-label={`${row.subject} 수정`}
                              className="rounded px-1.5 py-0.5 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                            >
                              수정
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteCustomSubject(row)}
                              aria-label={`${row.subject} 삭제`}
                              className="rounded px-1.5 py-0.5 text-xs text-red-500 hover:bg-red-50 hover:text-red-700"
                            >
                              삭제
                            </button>
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={groupName !== undefined}
                        onChange={() => toggleSelected(row.id)}
                        aria-label={`${row.subject} 선택`}
                        title={groupName ? `${groupName}에 속한 과목입니다` : undefined}
                        className="size-4 accent-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <aside className="lg:sticky lg:top-[173px]">
        <div className="min-h-48 w-full rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm lg:max-h-[calc(100vh-16rem)] lg:overflow-y-auto">
          <div className="flex items-center justify-between gap-3">
            <p className="text-base font-semibold text-zinc-900">그룹 생성</p>
            <button
              type="button"
              onClick={createGroup}
              className="rounded-lg bg-violet-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-800"
            >
              그룹 생성하기
            </button>
          </div>
          {groups.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-400">과목을 담을 그룹</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {groups.map((group) => {
                const groupRows = rows
                  .filter((row) => group.subjectIds.includes(row.id))
                  .sort((left, right) => trackRank(left.track) - trackRank(right.track));
                const trackCounts = TRACK_ORDER.map((track) => ({
                  track,
                  count: groupRows.filter((row) => row.track === track).length,
                })).filter((item) => item.count > 0);
                const pickCount = validPickCount(group);
                return (
                  <li
                    key={group.id}
                    onDragOver={(event) => handleGroupDragOver(event, group.id)}
                    onDragLeave={handleGroupDragLeave}
                    onDrop={(event) => handleGroupDrop(event, group.id)}
                    className={`rounded-xl border p-3 ${
                      dropTargetId === group.id
                        ? "border-violet-400 bg-violet-100"
                        : issueGroupIds.has(group.id)
                          ? "border-red-300 bg-red-50"
                          : "border-zinc-200 bg-zinc-50"
                    }`}
                  >
                    <div className="grid grid-cols-[minmax(0,1fr)_5rem_auto] items-center gap-x-2 gap-y-1">
                      <label className="text-xs font-medium text-zinc-500" htmlFor={`group-name-${group.id}`}>
                        설문 조사 제목
                      </label>
                      <label className="text-xs font-medium text-zinc-500" htmlFor={`group-pick-${group.id}`}>
                        선택수
                      </label>
                      <span />
                      <input
                        id={`group-name-${group.id}`}
                        type="text"
                        value={group.name}
                        onChange={(event) => renameGroup(group.id, event.target.value)}
                        onBlur={() => restoreEmptyGroupName(group.id)}
                        className="min-w-0 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                      />
                      <input
                        id={`group-pick-${group.id}`}
                        type="number"
                        min={1}
                        step={1}
                        value={group.pickCount ?? ""}
                        onChange={(event) => changePickCount(group.id, event.target.value)}
                        onBlur={() => restoreInvalidPickCount(group.id)}
                        className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-center text-sm text-zinc-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                      />
                      <button
                        type="button"
                        onClick={() => deleteGroup(group.id)}
                        aria-label={`${group.name} 삭제`}
                        className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                      >
                        삭제
                      </button>
                    </div>
                    {groupRows.length === 0 ? (
                      <button
                        type="button"
                        onClick={() => setSearchGroupId(group.id)}
                        className="mt-3 w-full rounded-lg border border-dashed border-zinc-300 px-3 py-4 text-center text-xs text-zinc-400 hover:border-violet-300 hover:bg-white hover:text-violet-700"
                      >
                        클릭해서 과목을 검색하거나, 선택한 과목을 끌어다 놓으세요
                      </button>
                    ) : (
                      <div className="mt-3">
                        <p className="text-sm font-medium text-zinc-500">
                          {pickCount ? (
                            <>
                              {groupRows.length}과목 중 <span className="text-zinc-900">{pickCount}과목 택</span>
                            </>
                          ) : (
                            `${groupRows.length}과목`
                          )}
                          {trackCounts.map(({ track, count }) => (
                            <span key={track} className={`ml-2 ${TRACK_TEXT[track]}`}>
                              {track.replace(" 선택", "")} {count}
                            </span>
                          ))}
                        </p>
                        {pickCount && pickCount > groupRows.length ? (
                          <p className="mt-1 text-xs font-medium text-red-600">
                            과목이 부족합니다 ({pickCount}과목 택, 현재 {groupRows.length}과목)
                          </p>
                        ) : pickCount === groupRows.length ? (
                          <p className="mt-1 text-xs text-zinc-400">모든 과목을 선택하는 그룹입니다</p>
                        ) : null}
                        <ul className="mt-1.5 flex flex-wrap gap-1.5">
                          {groupRows.map((row) => (
                            <li
                              key={row.id}
                              title={row.track}
                              className={`inline-flex items-center gap-1 rounded-full py-0.5 pl-2.5 pr-1 text-xs font-medium ring-1 ring-inset ${
                                TRACK_BADGE[row.track] ?? FALLBACK_BADGE
                              }`}
                            >
                              {row.subject}
                              <button
                                type="button"
                                onClick={() => removeSubject(group.id, row.id)}
                                aria-label={`${row.subject} 빼기`}
                                className="rounded-full px-1 text-current opacity-60 hover:bg-white/70 hover:opacity-100"
                              >
                                ×
                              </button>
                            </li>
                          ))}
                          <li>
                            <button
                              type="button"
                              onClick={() => setSearchGroupId(group.id)}
                              className="rounded-full border border-dashed border-zinc-300 px-2.5 py-0.5 text-xs font-medium text-zinc-500 hover:border-violet-300 hover:bg-white hover:text-violet-700"
                            >
                              + 과목 추가
                            </button>
                          </li>
                        </ul>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      <div className="sticky bottom-0 z-10 rounded-2xl border border-zinc-200 bg-white/95 px-5 py-3 shadow-sm backdrop-blur lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 text-sm">
            {saveError ? (
              <p role="alert" className="font-medium text-red-600">
                {saveError}
              </p>
            ) : dirty ? (
              <p className="text-amber-700">저장하지 않은 변경이 있습니다</p>
            ) : savedAt ? (
              <p className="text-zinc-500">저장됨 {formatSavedTime(savedAt)}</p>
            ) : (
              <p className="text-zinc-400">아직 저장하지 않았습니다</p>
            )}
            {liveIssues && liveIssues.length > 0 ? (
              <ul className="mt-1 space-y-0.5 text-xs text-red-600">
                {liveIssues.map((issue) => (
                  <li key={`${issue.groupId}-${issue.message}`}>{issue.message}</li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => save(false)}
              disabled={saving !== null}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving === "draft" ? "저장 중…" : "임시 저장"}
            </button>
            <button
              type="button"
              onClick={() => save(true)}
              disabled={saving !== null}
              className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving === "next" ? "저장 중…" : "다음: 설문지 양식 →"}
            </button>
          </div>
        </div>
      </div>

      {searchGroup ? (
        <SubjectSearchModal
          groupName={searchGroup.name}
          pickCount={validPickCount(searchGroup)}
          rows={rows}
          groupSubjectIds={searchGroup.subjectIds}
          groupNameBySubject={groupNameBySubject}
          groupOptions={groupOptions}
          onClose={() => setSearchGroupId(null)}
          onConfirm={(subjectIds) => {
            assignSubjects(searchGroup.id, subjectIds);
            setSearchGroupId(null);
          }}
          onCreateSubject={createCustomSubject}
        />
      ) : null}

      {subjectForm && (subjectForm.mode === "add" || editingRow) ? (
        <CustomSubjectModal
          initial={editingRow}
          editingId={editingRow?.id}
          groupOptions={groupOptions}
          rows={rows}
          onClose={() => setSubjectForm(null)}
          onSubmit={(draft) => {
            if (editingRow) updateCustomSubject(editingRow.id, draft);
            else createCustomSubject(draft);
            setSubjectForm(null);
          }}
        />
      ) : null}
    </div>
  );
}
