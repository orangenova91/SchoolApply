"use client";

import { useEffect, useMemo, useState } from "react";
import { blockLabel, type AssignmentStudent, type SurveyAssignment } from "@/lib/assignment";
import {
  ASSIGNMENT_TABLES,
  assignmentClasses,
  buildAssignmentTable,
  orderedSections,
  type AssignmentTableType,
} from "@/lib/assignment-tables";
import type { PublishedSurvey } from "@/lib/published-survey";
import { classLabel } from "@/lib/roster";

const SELECT_CLASS = "rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800";
const OUTLINE_LINK =
  "rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50";

/** 고정 열은 학번·이름 두 개까지라 첫 열 너비를 고정해 둘째 열 위치를 맞춘다. */
function frozenClass(index: number) {
  return index === 0 ? "left-0 w-[4.5rem] min-w-[4.5rem]" : "left-[4.5rem]";
}

export function AssignmentExportModal({
  surveyId,
  published,
  students,
  assignment,
  confirmed,
  problemCount,
  onClose,
}: {
  surveyId: string;
  published: PublishedSurvey;
  students: AssignmentStudent[];
  assignment: SurveyAssignment;
  confirmed: boolean;
  problemCount: number;
  onClose: () => void;
}) {
  const [type, setType] = useState<AssignmentTableType>("sections");
  const [termId, setTermId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [classKey, setClassKey] = useState("");
  const [fullScreen, setFullScreen] = useState(false);
  const info = ASSIGNMENT_TABLES.find((table) => table.type === type)!;
  const terms = assignment.settings.terms;
  const classes = useMemo(() => assignmentClasses(students), [students]);
  const termSections = useMemo(() => orderedSections(assignment, termId), [assignment, termId]);

  const filter = {
    termId: info.filter === "class" ? undefined : termId || undefined,
    sectionId: info.filter === "section" ? sectionId || undefined : undefined,
    classKey: info.filter === "class" ? classKey || undefined : undefined,
  };
  const table = buildAssignmentTable(type, { published, students, assignment }, filter);

  const base = `/api/surveys/${surveyId}/assignment/export`;
  const query = new URLSearchParams({ type });
  if (filter.termId) query.set("term", filter.termId);
  if (filter.sectionId) query.set("section", filter.sectionId);
  if (filter.classKey) query.set("class", filter.classKey);
  const splitQuery = new URLSearchParams({ split: "1" });
  if (termId) splitQuery.set("term", termId);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="assignment-export-title"
      onClick={onClose}
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 ${fullScreen ? "" : "p-4"}`}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className={`flex w-full flex-col overflow-hidden bg-white shadow-xl ${
          fullScreen ? "h-full" : "h-[85vh] max-w-6xl rounded-2xl border border-zinc-200"
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4">
          <h3 id="assignment-export-title" className="text-base font-semibold text-zinc-900">
            반 편성 자료
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFullScreen((value) => !value)}
              aria-pressed={fullScreen}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              {fullScreen ? "기본 크기" : "전체 보기"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              닫기
            </button>
          </div>
        </div>

        {!confirmed || problemCount > 0 ? (
          <div className="border-b border-zinc-100 px-5 py-2 text-xs">
            {!confirmed ? (
              <p className="text-amber-700">확정 전 자료입니다. 내려받은 파일 이름에 &quot;미확정&quot;이 붙습니다.</p>
            ) : null}
            {problemCount > 0 ? (
              <p className="text-red-600">
                응답이 바뀌었거나 교사 수를 넘는 블록이 {problemCount}건 있습니다. 자동 배정을 다시 실행한 뒤 내려받는 것이 좋습니다.
              </p>
            ) : null}
          </div>
        ) : null}

        <div role="tablist" aria-label="자료 종류" className="flex gap-1 overflow-x-auto border-b border-zinc-100 px-5 pt-3">
          {ASSIGNMENT_TABLES.map((tab) => (
            <button
              key={tab.type}
              type="button"
              role="tab"
              aria-selected={tab.type === type}
              onClick={() => setType(tab.type)}
              className={`shrink-0 rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium ${
                tab.type === type ? "border-violet-700 text-violet-700" : "border-transparent text-zinc-500 hover:text-zinc-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 px-5 py-3">
          {info.filter !== "class" ? (
            <select
              value={termId}
              onChange={(event) => {
                setTermId(event.target.value);
                setSectionId("");
              }}
              aria-label="학기"
              className={SELECT_CLASS}
            >
              <option value="">전체 학기</option>
              {terms.map((term) => (
                <option key={term.id} value={term.id}>
                  {term.label}
                </option>
              ))}
            </select>
          ) : null}
          {info.filter === "section" ? (
            <select value={sectionId} onChange={(event) => setSectionId(event.target.value)} aria-label="반" className={SELECT_CLASS}>
              <option value="">전체 반</option>
              {termSections.map((section) => (
                <option key={section.id} value={section.id}>
                  {termId ? "" : `${terms.find((term) => term.id === section.termId)?.label ?? ""} `}
                  {blockLabel(section.block)}블록 · {section.label} ({section.studentNos.length}명)
                </option>
              ))}
            </select>
          ) : null}
          {info.filter === "class" ? (
            <select value={classKey} onChange={(event) => setClassKey(event.target.value)} aria-label="학급" className={SELECT_CLASS}>
              <option value="">전체 학급</option>
              {classes.map((key) => (
                <option key={key} value={key}>
                  {classLabel(key)}
                </option>
              ))}
            </select>
          ) : null}
          <span className="text-sm text-zinc-600">{table.rows.length}줄</span>
        </div>

        <div className="min-h-0 flex-1 overflow-auto border-y border-zinc-100">
          {table.rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-zinc-500">
              {type === "unplaced" ? "반에 들어가지 못한 신청이 없습니다." : "표시할 내용이 없습니다."}
            </p>
          ) : (
            <table className="min-w-max border-separate border-spacing-0 text-left text-xs">
              <thead>
                <tr>
                  {table.columns.map((column, index) => (
                    <th
                      key={column.label}
                      className={`sticky top-0 border-b border-r border-zinc-200 bg-violet-50 px-3 py-2 font-semibold text-zinc-800 ${
                        index < table.frozenColumns ? `z-20 ${frozenClass(index)}` : "z-10"
                      }`}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, index) => (
                      <td
                        key={table.columns[index].label}
                        className={`border-b border-r border-zinc-100 px-3 py-1.5 text-zinc-700 ${
                          table.columns[index].kind === "number" ? "text-right tabular-nums" : ""
                        } ${index < table.frozenColumns ? `sticky bg-white ${frozenClass(index)}` : ""}`}
                      >
                        {cell ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 px-5 py-3">
          <a href={base} className={`mr-auto ${OUTLINE_LINK}`}>
            전체 다운로드 (표 4개)
          </a>
          {type === "rosters" ? (
            <a href={`${base}?${splitQuery}`} className={OUTLINE_LINK}>
              반별 시트로 다운로드{termId ? "" : " (전체 학기)"}
            </a>
          ) : null}
          <a
            href={`${base}?${query}`}
            aria-disabled={table.rows.length === 0}
            className={`rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800 ${
              table.rows.length === 0 ? "pointer-events-none opacity-50" : ""
            }`}
          >
            이 표 엑셀 다운로드
          </a>
        </div>
      </div>
    </div>
  );
}
