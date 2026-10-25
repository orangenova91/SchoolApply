"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { CustomSubjectModal } from "@/components/custom-subject-modal";
import {
  FALLBACK_BADGE,
  TRACK_BADGE,
  TrackBadge,
  normalizeSubjectName as normalize,
  type SubjectDraft,
  type SubjectRow,
} from "@/components/subject-shared";

const MAX_CANDIDATES = 8;
const CREATE_OPTION_ID = "__create__";

function matchRank(subject: string, query: string) {
  const name = normalize(subject);
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  if (name.includes(query)) return 2;
  return -1;
}

export function SubjectSearchModal({
  groupName,
  pickCount,
  rows,
  groupSubjectIds,
  groupNameBySubject,
  groupOptions,
  onClose,
  onConfirm,
  onCreateSubject,
}: {
  groupName: string;
  pickCount: number | null;
  rows: SubjectRow[];
  groupSubjectIds: string[];
  groupNameBySubject: Map<string, string>;
  groupOptions: string[];
  onClose: () => void;
  onConfirm: (subjectIds: string[]) => void;
  onCreateSubject: (draft: SubjectDraft) => string;
}) {
  const [query, setQuery] = useState("");
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const rowById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);

  function blockedReasonFor(id: string) {
    const otherGroup = groupNameBySubject.get(id);
    if (groupSubjectIds.includes(id)) return "이 그룹에 있음";
    if (pendingIds.includes(id)) return "추가 대기 중";
    if (otherGroup) return `${otherGroup}에 속함`;
    return null;
  }

  const normalizedQuery = normalize(query);
  const ranked = normalizedQuery
    ? rows
        .map((row, index) => ({ row, index, rank: matchRank(row.subject, normalizedQuery) }))
        .filter((item) => item.rank >= 0)
        .sort((left, right) => left.rank - right.rank || left.index - right.index)
    : [];
  const candidates = ranked
    .slice(0, MAX_CANDIDATES)
    .map(({ row }) => ({ row, blockedReason: blockedReasonFor(row.id) }));
  const showCreate = normalizedQuery.length > 0 && !ranked.some((item) => item.rank === 0);

  const availableIds = [
    ...candidates.filter((item) => !item.blockedReason).map((item) => item.row.id),
    ...(showCreate ? [CREATE_OPTION_ID] : []),
  ];
  const activeId = highlightId && availableIds.includes(highlightId) ? highlightId : (availableIds[0] ?? null);
  const activeIndex =
    activeId === CREATE_OPTION_ID ? candidates.length : candidates.findIndex((item) => item.row.id === activeId);

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function chooseOption(id: string) {
    if (id === CREATE_OPTION_ID) setCreating(true);
    else addSubject(id);
  }

  function closeCreate() {
    setCreating(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function addSubject(id: string) {
    setPendingIds((current) => (current.includes(id) ? current : [...current, id]));
    setQuery("");
    setHighlightId(null);
    inputRef.current?.focus();
  }

  function moveHighlight(step: number) {
    if (availableIds.length === 0) return;
    const index = activeId ? availableIds.indexOf(activeId) : -1;
    setHighlightId(availableIds[(index + step + availableIds.length) % availableIds.length]);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (pendingIds.length > 0) onConfirm(pendingIds);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeId) chooseOption(activeId);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      moveHighlight(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveHighlight(-1);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="subject-search-title"
      onClick={() => {
        if (pendingIds.length === 0) onClose();
      }}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="subject-search-title" className="text-base font-semibold text-zinc-900">
          {groupName}에 과목 추가
        </h3>
        <p className="mt-1 text-sm text-zinc-500">
          {pickCount ? `${pickCount}과목 택 · ` : ""}현재 {groupSubjectIds.length}과목
          {pendingIds.length > 0 ? (
            <span className="font-medium text-violet-700"> + 추가 {pendingIds.length}과목</span>
          ) : null}
        </p>

        <input
          ref={inputRef}
          type="text"
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlightId(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder="과목명을 입력하고 Enter"
          autoComplete="off"
          role="combobox"
          aria-expanded={candidates.length > 0 || showCreate}
          aria-controls="subject-search-results"
          aria-activedescendant={activeIndex >= 0 ? `subject-option-${activeIndex}` : undefined}
          className="mt-4 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
        />

        <div className="mt-2 min-h-24">
          {normalizedQuery && candidates.length === 0 ? (
            <p className="px-1 pb-1 pt-2 text-sm text-zinc-400">일치하는 과목이 없습니다</p>
          ) : null}
          <ul id="subject-search-results" role="listbox" className="space-y-0.5">
            {candidates.map(({ row, blockedReason }, index) => {
              const active = row.id === activeId;
              return (
                <li
                  key={row.id}
                  id={`subject-option-${index}`}
                  role="option"
                  aria-selected={active}
                  aria-disabled={blockedReason !== null}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => {
                    if (!blockedReason) setHighlightId(row.id);
                  }}
                  onClick={() => {
                    if (!blockedReason) addSubject(row.id);
                  }}
                  className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm ${
                    blockedReason
                      ? "cursor-not-allowed text-zinc-400"
                      : active
                        ? "cursor-pointer bg-violet-50 text-zinc-900"
                        : "cursor-pointer text-zinc-800"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{row.subject}</span>
                  <span className="text-xs text-zinc-400">{row.group}</span>
                  {blockedReason ? (
                    <span className="text-xs">{blockedReason}</span>
                  ) : (
                    <TrackBadge track={row.track} />
                  )}
                </li>
              );
            })}
            {showCreate ? (
              <li
                id={`subject-option-${candidates.length}`}
                role="option"
                aria-selected={activeId === CREATE_OPTION_ID}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setHighlightId(CREATE_OPTION_ID)}
                onClick={() => setCreating(true)}
                className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-violet-700 ${
                  activeId === CREATE_OPTION_ID ? "bg-violet-50" : ""
                }`}
              >
                <span aria-hidden="true">＋</span>
                <span className="min-w-0 flex-1 truncate">새 과목으로 추가: {query.trim()}</span>
              </li>
            ) : null}
          </ul>
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto border-t border-zinc-100 pt-3">
          <p className="text-xs font-medium text-zinc-500">추가할 과목 {pendingIds.length}개</p>
          {pendingIds.length === 0 ? (
            <p className="mt-1.5 text-xs text-zinc-400">검색 결과에서 Enter나 클릭으로 담으세요</p>
          ) : (
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {pendingIds.map((id) => {
                const row = rowById.get(id);
                if (!row) return null;
                return (
                  <li
                    key={id}
                    title={row.track}
                    className={`inline-flex items-center gap-1 rounded-full py-0.5 pl-2.5 pr-1 text-xs font-medium ring-1 ring-inset ${
                      TRACK_BADGE[row.track] ?? FALLBACK_BADGE
                    }`}
                  >
                    {row.subject}
                    <button
                      type="button"
                      onClick={() => {
                        setPendingIds((current) => current.filter((pendingId) => pendingId !== id));
                        inputRef.current?.focus();
                      }}
                      aria-label={`${row.subject} 빼기`}
                      className="rounded-full px-1 text-current opacity-60 hover:bg-white/70 hover:opacity-100"
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs text-zinc-400">Enter 담기 · ↑↓ 이동 · Ctrl+Enter 완료</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              취소
            </button>
            <button
              type="button"
              disabled={pendingIds.length === 0}
              onClick={() => onConfirm(pendingIds)}
              className="rounded-lg bg-violet-700 px-3 py-2 text-sm font-medium text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              선택 완료 ({pendingIds.length})
            </button>
          </div>
        </div>

        {creating ? (
          <CustomSubjectModal
            initial={{ subject: query.trim() }}
            groupOptions={groupOptions}
            rows={rows}
            onClose={closeCreate}
            onSubmit={(draft) => {
              addSubject(onCreateSubject(draft));
              closeCreate();
            }}
            onUseExisting={(id) => {
              if (!blockedReasonFor(id)) addSubject(id);
              closeCreate();
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
