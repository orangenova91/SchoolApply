"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { TrackBadge } from "@/components/subject-shared";
import { STATUS_BADGE } from "@/components/survey-status-controls";
import {
  ASSIGNMENT_LIMITS,
  blockLabel,
  checkAssignment,
  defaultSectionCount,
  parseSettings,
  requiredBlocks,
  teacherCount,
  teacherGroups,
  teacherViolations,
  termSubjects,
  type AssignmentSection,
  type AssignmentSettings,
  type AssignmentStudent,
  type SurveyAssignment,
  type TermSubject,
  type UnplacedPick,
} from "@/lib/assignment";
import type { PublishedSurvey } from "@/lib/published-survey";
import { classKey, classLabel } from "@/lib/roster";
import type { SurveyStatus } from "@/lib/survey-types";

const INPUT_CLASS =
  "w-20 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:bg-zinc-50 disabled:text-zinc-500";
const OUTLINE_BUTTON =
  "rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50";
const PRIMARY_BUTTON =
  "rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50";

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function NumberField({
  value,
  min,
  max,
  disabled,
  placeholder,
  onChange,
  label,
}: {
  value: number | null;
  min: number;
  max: number;
  disabled: boolean;
  placeholder?: string;
  onChange: (value: number | null) => void;
  label: string;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      aria-label={label}
      min={min}
      max={max}
      value={value ?? ""}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(event) => {
        const raw = event.target.value;
        if (raw === "") return onChange(null);
        const next = Math.trunc(Number(raw));
        if (Number.isFinite(next)) onChange(Math.max(min, Math.min(max, next)));
      }}
      className={INPUT_CLASS}
    />
  );
}

/** 학생을 from 반에서 빼서 to 반에 넣는다. null이면 빼기만/넣기만 한다. */
function moveStudent(sections: AssignmentSection[], studentNo: string, fromId: string | null, toId: string | null) {
  return sections.map((section) => {
    if (section.id === fromId) return { ...section, studentNos: section.studentNos.filter((no) => no !== studentNo) };
    if (section.id === toId) return { ...section, studentNos: [...section.studentNos, studentNo].sort() };
    return section;
  });
}

/** 이 학생을 target 반으로 옮기면 같은 블록의 다른 반과 겹치는지 */
function blockConflict(sections: AssignmentSection[], studentNo: string, target: AssignmentSection, fromId: string | null) {
  return sections.some(
    (section) =>
      section.id !== fromId &&
      section.id !== target.id &&
      section.termId === target.termId &&
      section.block === target.block &&
      section.studentNos.includes(studentNo),
  );
}

function MoveSelect({
  sections,
  studentNo,
  current,
  subjectId,
  termId,
  maxSize,
  disabled,
  onMove,
}: {
  sections: AssignmentSection[];
  studentNo: string;
  current: AssignmentSection | null;
  subjectId: string;
  termId: string;
  maxSize: number;
  disabled: boolean;
  onMove: (toId: string | null) => void;
}) {
  const options = sections.filter(
    (section) => section.termId === termId && section.subjectId === subjectId && section.id !== current?.id,
  );
  return (
    <select
      value=""
      disabled={disabled}
      aria-label={`${studentNo} 반 옮기기`}
      onChange={(event) => {
        const value = event.target.value;
        if (value) onMove(value === "__out" ? null : value);
      }}
      className="rounded-md border border-zinc-300 bg-white px-1.5 py-1 text-xs text-zinc-700 disabled:opacity-50"
    >
      <option value="">{current ? "옮기기…" : "반 넣기…"}</option>
      {options.map((section) => {
        const conflict = blockConflict(sections, studentNo, section, current?.id ?? null);
        const full = section.studentNos.length >= maxSize;
        return (
          <option key={section.id} value={section.id} disabled={conflict}>
            {section.label} · {blockLabel(section.block)}블록 · {section.studentNos.length}명
            {conflict ? " (시간 겹침)" : full ? " (정원 참)" : ""}
          </option>
        );
      })}
      {current ? <option value="__out">반에서 빼기</option> : null}
    </select>
  );
}

function TeacherGroupsEditor({
  termId,
  electives,
  settings,
  disabled,
  onChange,
}: {
  termId: string;
  electives: TermSubject[];
  settings: AssignmentSettings;
  disabled: boolean;
  onChange: (settings: AssignmentSettings) => void;
}) {
  const termSubjectIds = new Set(electives.map((subject) => subject.id));
  const allGroups = teacherGroups(settings);
  const groups = allGroups.filter((group) =>
    group.subjectIds.length > 0 ? group.subjectIds.some((id) => termSubjectIds.has(id)) : group.id.startsWith(`${termId}-`),
  );
  const offered = electives.filter((subject) => subject.demand > 0);

  function update(groupId: string, patch: Partial<AssignmentSettings["teacherGroups"][number]>) {
    onChange({
      ...settings,
      teacherGroups: allGroups.map((group) => (group.id === groupId ? { ...group, ...patch } : group)),
    });
  }

  function add() {
    const used = new Set(allGroups.map((group) => group.id));
    let next = allGroups.length + 1;
    while (used.has(`${termId}-${next}`)) next += 1;
    onChange({
      ...settings,
      teacherGroups: [
        ...allGroups,
        { id: `${termId}-${next}`, label: `교사 묶음 ${groups.length + 1}`, subjectIds: [], count: 1 },
      ],
    });
  }

  return (
    <div className="mt-3 rounded-lg border border-dashed border-zinc-300 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-zinc-800">교사 묶음</p>
        <p className="text-xs text-zinc-500">
          한 교사가 이 학기에 여러 과목을 맡으면 묶어 주세요. 블록마다 묶은 과목들의 반 수 합이 교사 수를 넘지 않게 배정합니다.
        </p>
        <button
          type="button"
          onClick={add}
          disabled={disabled || allGroups.length >= ASSIGNMENT_LIMITS.teacherGroups}
          className={`ml-auto ${OUTLINE_BUTTON}`}
        >
          묶음 추가
        </button>
      </div>
      {groups.map((group) => (
        <div key={group.id} className="mt-3 rounded-lg bg-zinc-50 p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-700">
            <input
              value={group.label}
              maxLength={ASSIGNMENT_LIMITS.groupLabel}
              disabled={disabled}
              aria-label="교사 묶음 이름"
              onChange={(event) => update(group.id, { label: event.target.value })}
              className="w-40 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm disabled:bg-zinc-50"
            />
            교사
            <NumberField
              label={`${group.label} 교사 수`}
              value={group.count}
              min={1}
              max={ASSIGNMENT_LIMITS.teachers}
              disabled={disabled}
              onChange={(value) => update(group.id, { count: value ?? 1 })}
            />
            명
            <button
              type="button"
              disabled={disabled}
              onClick={() =>
                onChange({ ...settings, teacherGroups: allGroups.filter((item) => item.id !== group.id) })
              }
              className="ml-auto rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              삭제
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {offered.map((subject) => {
              const checked = group.subjectIds.includes(subject.id);
              return (
                <label
                  key={subject.id}
                  className={`flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 text-xs ring-1 ${
                    checked ? "bg-violet-700 text-white ring-violet-700" : "bg-white text-zinc-700 ring-zinc-200"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    disabled={disabled}
                    onChange={() =>
                      update(group.id, {
                        subjectIds: checked
                          ? group.subjectIds.filter((id) => id !== subject.id)
                          : [...group.subjectIds, subject.id],
                      })
                    }
                  />
                  {subject.subject}
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function SettingsEditor({
  published,
  students,
  settings,
  disabled,
  onChange,
}: {
  published: PublishedSurvey;
  students: AssignmentStudent[];
  settings: AssignmentSettings;
  disabled: boolean;
  onChange: (settings: AssignmentSettings) => void;
}) {
  function updateTerm(termId: string, patch: Partial<AssignmentSettings["terms"][number]>) {
    onChange({ ...settings, terms: settings.terms.map((term) => (term.id === termId ? { ...term, ...patch } : term)) });
  }

  function moveQuestion(groupId: number, termId: string) {
    onChange({
      ...settings,
      terms: settings.terms.map((term) => ({
        ...term,
        groupIds:
          term.id === termId
            ? [...term.groupIds.filter((id) => id !== groupId), groupId].sort((a, b) => a - b)
            : term.groupIds.filter((id) => id !== groupId),
      })),
    });
  }

  function resetCounts() {
    const sectionCounts = { ...settings.sectionCounts };
    for (const term of settings.terms) {
      for (const subject of termSubjects(published, students, term.groupIds)) {
        if (!subject.common) sectionCounts[subject.id] = defaultSectionCount(subject.demand, settings.maxSize);
      }
    }
    onChange({ ...settings, sectionCounts });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          반 최대 인원
          <NumberField
            label="반 최대 인원"
            value={settings.maxSize}
            min={1}
            max={ASSIGNMENT_LIMITS.maxSize}
            disabled={disabled}
            onChange={(value) => onChange({ ...settings, maxSize: value ?? 1 })}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          반 최소 인원
          <NumberField
            label="반 최소 인원"
            value={settings.minSize}
            min={0}
            max={ASSIGNMENT_LIMITS.maxSize}
            disabled={disabled}
            onChange={(value) => onChange({ ...settings, minSize: value ?? 0 })}
          />
        </label>
        <button type="button" onClick={resetCounts} disabled={disabled} className={OUTLINE_BUTTON}>
          최대 인원 기준으로 반 수 다시 계산
        </button>
        <p className="text-xs text-zinc-500">반 수를 0으로 두면 그 과목은 개설하지 않습니다.</p>
      </div>

      {published.questions.length > 1 && settings.terms.length > 1 ? (
        <div className="rounded-xl border border-zinc-200 p-4">
          <p className="text-sm font-semibold text-zinc-900">문항별 학기</p>
          <p className="mt-0.5 text-xs text-zinc-500">같은 학기에 듣는 과목끼리는 시간이 겹치지 않게 배정합니다.</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {published.questions.map((question, index) => {
              const termId = settings.terms.find((term) => term.groupIds.includes(question.groupId))?.id ?? "";
              return (
                <li key={question.groupId} className="flex items-center gap-2 rounded-lg bg-zinc-50 px-3 py-1.5 text-sm">
                  <span className="text-zinc-700">
                    {index + 1}. {question.title}
                  </span>
                  <select
                    value={termId}
                    disabled={disabled}
                    aria-label={`${index + 1}번 문항 학기`}
                    onChange={(event) => moveQuestion(question.groupId, event.target.value)}
                    className="rounded-md border border-zinc-300 bg-white px-1.5 py-0.5 text-xs"
                  >
                    {settings.terms.map((term) => (
                      <option key={term.id} value={term.id}>
                        {term.label}
                      </option>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {settings.terms.map((term) => {
        if (term.groupIds.length === 0) return null;
        const subjects = termSubjects(published, students, term.groupIds);
        const common = subjects.filter((subject) => subject.common);
        const electives = subjects.filter((subject) => !subject.common).sort((a, b) => b.demand - a.demand);
        const needed = requiredBlocks(students, subjects, settings);
        const totalSections = electives.reduce((sum, subject) => sum + (settings.sectionCounts[subject.id] ?? 0), 0);
        return (
          <div key={term.id} className="rounded-xl border border-zinc-200 p-4">
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
                학기 이름
                <input
                  value={term.label}
                  maxLength={ASSIGNMENT_LIMITS.termLabel}
                  disabled={disabled}
                  onChange={(event) => updateTerm(term.id, { label: event.target.value })}
                  className="w-28 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900 disabled:bg-zinc-50"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
                블록 수
                <NumberField
                  label={`${term.label} 블록 수`}
                  value={term.blockCount}
                  min={1}
                  max={ASSIGNMENT_LIMITS.blocks}
                  disabled={disabled}
                  onChange={(value) => updateTerm(term.id, { blockCount: value ?? 1 })}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
                블록당 최대 반 수
                <NumberField
                  label={`${term.label} 블록당 최대 반 수`}
                  value={term.maxSectionsPerBlock}
                  min={1}
                  max={ASSIGNMENT_LIMITS.sectionsPerBlock}
                  placeholder="제한 없음"
                  disabled={disabled}
                  onChange={(value) => updateTerm(term.id, { maxSectionsPerBlock: value })}
                />
              </label>
              <p className="pb-2 text-xs text-zinc-500">
                학생 한 명이 최대 {needed}과목을 들어 블록이 {needed}개 이상 필요합니다 · 개설 반 {totalSections}개
              </p>
            </div>
            {common.length > 0 ? (
              <p className="mt-3 text-xs text-zinc-500">
                전원 이수(학급 단위 수업, 배정 안 함): {common.map((subject) => subject.subject).join(", ")}
              </p>
            ) : null}
            <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-50 text-xs text-zinc-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">과목</th>
                    <th className="px-3 py-2 font-medium">구분</th>
                    <th className="px-3 py-2 text-right font-medium">신청</th>
                    <th className="px-3 py-2 font-medium">반 수</th>
                    <th className="px-3 py-2 font-medium" title="한 블록에 동시에 열 수 있는 그 과목 반 수">
                      교사 수
                    </th>
                    <th className="px-3 py-2 text-right font-medium">반당 평균</th>
                    <th className="px-3 py-2 font-medium">확인</th>
                  </tr>
                </thead>
                <tbody>
                  {electives.map((subject) => {
                    const count = settings.sectionCounts[subject.id] ?? 0;
                    const teachers = teacherCount(settings, subject.id);
                    const average = count ? subject.demand / count : 0;
                    const note =
                      subject.demand === 0
                        ? { text: "신청 없음", tone: "text-zinc-400" }
                        : count === 0
                          ? { text: `개설 안 함 · ${subject.demand}명 미배정`, tone: "text-amber-700" }
                          : count > teachers * term.blockCount
                            ? { text: "교사·블록이 부족합니다", tone: "text-red-600" }
                          : subject.demand > count * settings.maxSize
                            ? { text: "정원 부족 · 반을 늘려 주세요", tone: "text-red-600" }
                            : subject.demand < count * settings.minSize
                              ? { text: "최소 인원 미달 · 반을 줄여 주세요", tone: "text-red-600" }
                              : count === 1 && subject.demand < 13
                                ? { text: "소인수", tone: "text-amber-700" }
                                : { text: "정상", tone: "text-zinc-500" };
                    return (
                      <tr key={subject.id} className="border-t border-zinc-100">
                        <td className="px-3 py-1.5 text-zinc-900">{subject.subject}</td>
                        <td className="px-3 py-1.5">
                          <TrackBadge track={subject.track} />
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-zinc-700">{subject.demand}명</td>
                        <td className="px-3 py-1.5">
                          <NumberField
                            label={`${subject.subject} 반 수`}
                            value={count}
                            min={0}
                            max={ASSIGNMENT_LIMITS.sectionsPerSubject}
                            disabled={disabled || subject.demand === 0}
                            onChange={(value) =>
                              onChange({ ...settings, sectionCounts: { ...settings.sectionCounts, [subject.id]: value ?? 0 } })
                            }
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <NumberField
                            label={`${subject.subject} 교사 수`}
                            value={teachers}
                            min={1}
                            max={ASSIGNMENT_LIMITS.teachers}
                            disabled={disabled || count === 0}
                            onChange={(value) =>
                              onChange({ ...settings, teacherCounts: { ...settings.teacherCounts, [subject.id]: value ?? 1 } })
                            }
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-zinc-700">
                          {count ? `${average.toFixed(1)}명` : "-"}
                        </td>
                        <td className={`px-3 py-1.5 text-xs ${note.tone}`}>{note.text}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <TeacherGroupsEditor
              termId={term.id}
              electives={electives}
              settings={settings}
              disabled={disabled}
              onChange={onChange}
            />
          </div>
        );
      })}
    </div>
  );
}

export function AssignmentPanel({
  surveyId,
  status,
  published,
  students,
  excludedCount,
  initialAssignment,
  defaultSettings,
}: {
  surveyId: string;
  status: SurveyStatus;
  published: PublishedSurvey;
  students: AssignmentStudent[];
  excludedCount: number;
  initialAssignment: SurveyAssignment | null;
  defaultSettings: AssignmentSettings;
}) {
  const router = useRouter();
  const [assignment, setAssignment] = useState(initialAssignment);
  const [settings, setSettings] = useState(initialAssignment?.settings ?? defaultSettings);
  const [sections, setSections] = useState(initialAssignment?.sections ?? []);
  const [termId, setTermId] = useState(settings.terms[0]?.id ?? "");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<"solve" | "save" | "confirm" | "unconfirm" | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const editable = status === "closed";
  const confirmed = status === "assigned";
  const badge = STATUS_BADGE[status];
  const dirty = assignment !== null && sections !== assignment.sections;
  const activeSettings = assignment?.settings ?? settings;
  const studentByNo = useMemo(() => new Map(students.map((student) => [student.studentNo, student])), [students]);
  const subjectName = useMemo(
    () => new Map(published.questions.flatMap((question) => question.subjects.map((subject) => [subject.id, subject.subject]))),
    [published],
  );
  const check = useMemo(
    () => (assignment ? checkAssignment(published, students, assignment.settings, sections) : null),
    [assignment, published, students, sections],
  );
  const violations = useMemo(
    () => (assignment ? teacherViolations(assignment.settings, sections, subjectName) : []),
    [assignment, sections, subjectName],
  );
  const settingsError = useMemo(() => {
    const parsed = parseSettings(
      { ...settings, terms: settings.terms.filter((term) => term.groupIds.length > 0) },
      published,
      students,
    );
    return parsed.ok ? "" : parsed.error;
  }, [settings, published, students]);

  async function post(action: string, extra: Record<string, unknown> = {}) {
    const response = await fetch(`/api/surveys/${surveyId}/assignment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const data = (await response.json().catch(() => ({}))) as { assignment?: SurveyAssignment; error?: string };
    if (!response.ok) throw new Error(data.error ?? "요청을 처리하지 못했습니다.");
    return data;
  }

  async function solve() {
    if (assignment && !window.confirm("지금 반 편성을 지우고 새로 배정할까요? 직접 옮긴 내용도 사라집니다.")) return;
    setBusy("solve");
    setMessage(null);
    try {
      const data = await post("solve", {
        settings: { ...settings, terms: settings.terms.filter((term) => term.groupIds.length > 0) },
      });
      const next = data.assignment!;
      setAssignment(next);
      setSettings(next.settings);
      setSections(next.sections);
      setTermId(next.settings.terms[0]?.id ?? "");
      setSelectedId(null);
      const conflicts = next.unplaced.filter((item) => item.reason === "conflict").length;
      setMessage({
        tone: conflicts > 0 ? "error" : "ok",
        text:
          conflicts > 0
            ? `배정했지만 ${conflicts}건은 시간이 겹치거나 자리가 없어 반에 넣지 못했습니다. 반 수·블록 수·교사 수를 늘려 다시 실행하거나 직접 옮겨 주세요.`
            : "모든 학생을 시간이 겹치지 않게 배정했습니다.",
      });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "배정하지 못했습니다." });
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy("save");
    setMessage(null);
    try {
      const data = await post("save", {
        sections: sections.map((section) => ({ id: section.id, studentNos: section.studentNos })),
      });
      setAssignment(data.assignment!);
      setSections(data.assignment!.sections);
      setMessage({ tone: "ok", text: "옮긴 내용을 저장했습니다." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "저장하지 못했습니다." });
    } finally {
      setBusy(null);
    }
  }

  async function changeConfirm(action: "confirm" | "unconfirm") {
    const prompt =
      action === "confirm"
        ? check && check.unplaced.length > 0
          ? `반에 들어가지 못한 신청이 ${check.unplaced.length}건 있습니다. 그대로 확정할까요? 확정하면 응답과 반 편성을 고칠 수 없습니다.`
          : "반 편성을 확정할까요? 확정하면 응답과 반 편성을 고칠 수 없습니다."
        : "확정을 취소할까요? 다시 마감 상태가 되어 응답과 반 편성을 고칠 수 있습니다.";
    if (!window.confirm(prompt)) return;
    setBusy(action);
    setMessage(null);
    try {
      await post(action);
      router.refresh();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "상태를 바꾸지 못했습니다." });
    } finally {
      setBusy(null);
    }
  }

  function move(studentNo: string, fromId: string | null, toId: string | null) {
    setSections((current) => moveStudent(current, studentNo, fromId, toId));
  }

  const term = activeSettings.terms.find((item) => item.id === termId) ?? activeSettings.terms[0];
  const termSections = term ? sections.filter((section) => section.termId === term.id) : [];
  const selected = sections.find((section) => section.id === selectedId) ?? null;
  const unplacedInTerm = check?.unplaced.filter((item) => item.termId === term?.id) ?? [];
  const matches = query.trim()
    ? students.filter((student) => student.studentNo.includes(query.trim()) || student.name.includes(query.trim())).slice(0, 5)
    : [];

  if (status === "preparing" || status === "open") {
    return (
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm text-zinc-700">설문을 마감한 뒤에 반을 편성할 수 있습니다.</p>
        <Link href={`/surveys/${surveyId}/results`} className={`mt-4 inline-block ${PRIMARY_BUTTON}`}>
          응답 확인으로 가기
        </Link>
      </section>
    );
  }

  return (
    <div className="flex w-full flex-col gap-6">
      {message ? (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={`rounded-xl border px-4 py-3 text-sm ${
            message.tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-800"
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-semibold text-zinc-900">① 편성 조건</h2>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.tone}`}>{badge.label}</span>
          <span className="text-xs text-zinc-500">
            제출한 학생 {students.length}명 기준
            {excludedCount > 0 ? ` · 미제출·다시 제출 필요 ${excludedCount}명은 배정에서 빠집니다` : ""}
          </span>
        </div>
        <div className="mt-4">
          <SettingsEditor
            published={published}
            students={students}
            settings={settings}
            disabled={!editable || busy !== null}
            onChange={setSettings}
          />
        </div>
        {editable ? (
          <div className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-zinc-100 pt-4">
            {settingsError ? <p className="mr-auto text-sm text-red-600">{settingsError}</p> : null}
            {busy === "solve" ? <p className="text-xs text-zinc-500">계산 중입니다. 1분 정도 걸릴 수 있습니다.</p> : null}
            <button
              type="button"
              onClick={solve}
              disabled={busy !== null || Boolean(settingsError) || students.length === 0}
              className={PRIMARY_BUTTON}
            >
              {busy === "solve" ? "배정 계산 중…" : assignment ? "자동 배정 다시 실행" : "자동 배정 실행"}
            </button>
          </div>
        ) : null}
      </section>

      {assignment && term ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-base font-semibold text-zinc-900">② 배정 결과</h2>
            <span className="text-xs text-zinc-500">
              자동 배정 {formatTime(assignment.solvedAt)}
              {assignment.updatedAt !== assignment.solvedAt ? ` · 마지막 수정 ${formatTime(assignment.updatedAt)}` : ""}
            </span>
            <div className="ml-auto flex gap-1 rounded-lg bg-zinc-100 p-1 text-sm font-medium">
              {activeSettings.terms.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setTermId(item.id);
                    setSelectedId(null);
                  }}
                  className={`rounded-md px-3 py-1 ${item.id === term.id ? "bg-white text-violet-700 shadow-sm" : "text-zinc-600"}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          {assignment.timeLimited ? (
            <p className="mt-2 text-xs text-zinc-500">
              계산 시간 제한에 걸려 반 인원이 가장 고르지는 않을 수 있습니다. 다시 실행하면 결과가 달라질 수 있습니다.
            </p>
          ) : null}
          {check && check.problems.length > 0 ? (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              응답이 바뀌었거나 교사 수를 넘는 블록이 있어 지금 배정을 확정할 수 없습니다. 자동 배정을 다시 실행해 주세요.
              <ul className="mt-1 list-disc pl-5 text-xs">
                {check.problems.slice(0, 5).map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div
            className="mt-4 grid gap-3"
            style={{ gridTemplateColumns: `repeat(${Math.min(term.blockCount, 6)}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: term.blockCount }, (_, block) => {
              const inBlock = termSections
                .filter((section) => section.block === block)
                .sort((a, b) => a.label.localeCompare(b.label, "ko"));
              const seated = inBlock.reduce((sum, section) => sum + section.studentNos.length, 0);
              return (
                <div key={block} className="rounded-xl border border-zinc-200 bg-zinc-50 p-2">
                  <p className="px-1 text-sm font-semibold text-zinc-900">{blockLabel(block)}블록</p>
                  <p className="px-1 text-xs text-zinc-500">
                    반 {inBlock.length}개 · {seated}명
                  </p>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {inBlock.map((section) => {
                      const size = section.studentNos.length;
                      const tone =
                        size > activeSettings.maxSize
                          ? "text-red-600"
                          : size < activeSettings.minSize
                            ? "text-amber-700"
                            : "text-zinc-500";
                      const overTeachers = violations.some(
                        (violation) =>
                          violation.termId === section.termId &&
                          violation.block === section.block &&
                          violation.subjectIds.includes(section.subjectId),
                      );
                      return (
                        <li key={section.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedId(section.id === selectedId ? null : section.id)}
                            title={overTeachers ? "같은 블록에 교사 수보다 많은 반이 있습니다" : undefined}
                            className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm ring-1 ${
                              section.id === selectedId
                                ? "bg-violet-700 text-white ring-violet-700"
                                : overTeachers
                                  ? "bg-red-50 text-red-800 ring-2 ring-red-400"
                                  : "bg-white text-zinc-800 ring-zinc-200 hover:ring-violet-300"
                            }`}
                          >
                            <span className="min-w-0 truncate">{section.label}</span>
                            <span className={`shrink-0 text-xs tabular-nums ${section.id === selectedId ? "text-violet-100" : tone}`}>
                              {size}/{activeSettings.maxSize}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>

          {selected ? (
            <div className="mt-4 rounded-xl border border-violet-200 p-4">
              <p className="text-sm font-semibold text-zinc-900">
                {selected.label} · {blockLabel(selected.block)}블록 · {selected.studentNos.length}명
              </p>
              <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {selected.studentNos.map((studentNo) => (
                  <li key={studentNo} className="flex items-center justify-between gap-2 rounded-md bg-zinc-50 px-2 py-1 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="font-mono text-zinc-600">{studentNo}</span> {studentByNo.get(studentNo)?.name}
                      <span className="ml-1 text-xs text-zinc-400">{classLabel(classKey(studentNo))}</span>
                    </span>
                    <MoveSelect
                      sections={sections}
                      studentNo={studentNo}
                      current={selected}
                      subjectId={selected.subjectId}
                      termId={selected.termId}
                      maxSize={activeSettings.maxSize}
                      disabled={!editable}
                      onMove={(toId) => move(studentNo, selected.id, toId)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-3 text-xs text-zinc-500">반을 누르면 명단을 보고 학생을 다른 반으로 옮길 수 있습니다.</p>
          )}

          {unplacedInTerm.length > 0 ? (
            <UnplacedList
              items={unplacedInTerm}
              sections={sections}
              studentByNo={studentByNo}
              subjectName={subjectName}
              maxSize={activeSettings.maxSize}
              editable={editable}
              onPlace={(studentNo, toId) => move(studentNo, null, toId)}
            />
          ) : (
            <p className="mt-4 text-sm text-green-700">{term.label}: 신청한 과목을 모두 배정했습니다.</p>
          )}

          <div className="mt-5 border-t border-zinc-100 pt-4">
            <label className="flex flex-wrap items-center gap-2 text-sm text-zinc-700">
              학생 찾기
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="학번 또는 이름"
                className="w-48 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-violet-500"
              />
            </label>
            {matches.map((student) => (
              <StudentTimetable
                key={student.studentNo}
                student={student}
                settings={activeSettings}
                sections={sections}
                unplaced={check?.unplaced ?? []}
                subjectName={subjectName}
                editable={editable}
                onMove={move}
              />
            ))}
          </div>
        </section>
      ) : null}

      <div className="sticky bottom-0 z-10 rounded-2xl border border-zinc-200 bg-white/95 px-5 py-3 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/surveys/${surveyId}/results`}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            ← 이전: 응답 확인
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            {dirty ? (
              <>
                <span className="text-xs text-amber-700">저장하지 않은 변경이 있습니다</span>
                <button
                  type="button"
                  onClick={() => setSections(assignment!.sections)}
                  disabled={busy !== null}
                  className={OUTLINE_BUTTON}
                >
                  되돌리기
                </button>
                <button type="button" onClick={save} disabled={busy !== null} className={PRIMARY_BUTTON}>
                  {busy === "save" ? "저장 중…" : "변경 저장"}
                </button>
              </>
            ) : null}
            {assignment && !dirty ? (
              <a href={`/api/surveys/${surveyId}/assignment/export`} className={OUTLINE_BUTTON}>
                엑셀 내려받기
              </a>
            ) : null}
            {assignment && editable && !dirty ? (
              <button
                type="button"
                onClick={() => changeConfirm("confirm")}
                disabled={busy !== null || (check?.problems.length ?? 0) > 0}
                className={PRIMARY_BUTTON}
              >
                {busy === "confirm" ? "확정 중…" : "반 편성 확정"}
              </button>
            ) : null}
            {confirmed ? (
              <button type="button" onClick={() => changeConfirm("unconfirm")} disabled={busy !== null} className={OUTLINE_BUTTON}>
                {busy === "unconfirm" ? "취소 중…" : "확정 취소"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function UnplacedList({
  items,
  sections,
  studentByNo,
  subjectName,
  maxSize,
  editable,
  onPlace,
}: {
  items: UnplacedPick[];
  sections: AssignmentSection[];
  studentByNo: Map<string, AssignmentStudent>;
  subjectName: Map<string, string>;
  maxSize: number;
  editable: boolean;
  onPlace: (studentNo: string, toId: string) => void;
}) {
  const conflicts = items.filter((item) => item.reason === "conflict");
  const closed = items.filter((item) => item.reason === "closed");
  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
      <p className="text-sm font-semibold text-amber-900">반에 들어가지 못한 신청 {items.length}건</p>
      {conflicts.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1">
          {conflicts.map((item) => (
            <li key={`${item.studentNo}-${item.subjectId}`} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-mono text-zinc-600">{item.studentNo}</span>
              <span>{studentByNo.get(item.studentNo)?.name}</span>
              <span className="text-zinc-500">· {subjectName.get(item.subjectId)}</span>
              <MoveSelect
                sections={sections}
                studentNo={item.studentNo}
                current={null}
                subjectId={item.subjectId}
                termId={item.termId}
                maxSize={maxSize}
                disabled={!editable}
                onMove={(toId) => toId && onPlace(item.studentNo, toId)}
              />
            </li>
          ))}
        </ul>
      ) : null}
      {closed.length > 0 ? (
        <p className="mt-2 text-xs text-amber-800">
          개설하지 않은 과목:{" "}
          {[...new Set(closed.map((item) => item.subjectId))]
            .map((id) => `${subjectName.get(id)} ${closed.filter((item) => item.subjectId === id).length}명`)
            .join(", ")}
        </p>
      ) : null}
    </div>
  );
}

function StudentTimetable({
  student,
  settings,
  sections,
  unplaced,
  subjectName,
  editable,
  onMove,
}: {
  student: AssignmentStudent;
  settings: AssignmentSettings;
  sections: AssignmentSection[];
  unplaced: UnplacedPick[];
  subjectName: Map<string, string>;
  editable: boolean;
  onMove: (studentNo: string, fromId: string | null, toId: string | null) => void;
}) {
  return (
    <div className="mt-3 rounded-xl border border-zinc-200 p-3">
      <p className="text-sm font-semibold text-zinc-900">
        <span className="font-mono">{student.studentNo}</span> {student.name}
        <span className="ml-1 text-xs font-normal text-zinc-500">{classLabel(classKey(student.studentNo))}</span>
      </p>
      {settings.terms.map((term) => {
        const mine = sections.filter((section) => section.termId === term.id && section.studentNos.includes(student.studentNo));
        const missing = unplaced.filter((item) => item.termId === term.id && item.studentNo === student.studentNo);
        return (
          <div key={term.id} className="mt-2">
            <p className="text-xs font-medium text-zinc-500">{term.label}</p>
            <ul className="mt-1 flex flex-wrap gap-2">
              {Array.from({ length: term.blockCount }, (_, block) => {
                const section = mine.find((item) => item.block === block);
                return (
                  <li key={block} className="flex items-center gap-1.5 rounded-lg bg-zinc-50 px-2 py-1 text-sm">
                    <span className="text-xs font-semibold text-zinc-400">{blockLabel(block)}</span>
                    {section ? (
                      <>
                        <span>{section.label}</span>
                        <MoveSelect
                          sections={sections}
                          studentNo={student.studentNo}
                          current={section}
                          subjectId={section.subjectId}
                          termId={term.id}
                          maxSize={settings.maxSize}
                          disabled={!editable}
                          onMove={(toId) => onMove(student.studentNo, section.id, toId)}
                        />
                      </>
                    ) : (
                      <span className="text-zinc-400">비어 있음</span>
                    )}
                  </li>
                );
              })}
            </ul>
            {missing.length > 0 ? (
              <p className="mt-1 text-xs text-amber-700">
                반 없음: {missing.map((item) => subjectName.get(item.subjectId)).join(", ")}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
