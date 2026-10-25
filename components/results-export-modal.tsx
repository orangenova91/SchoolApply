"use client";

import { useEffect, useMemo, useState } from "react";
import { StudentResponseModal } from "@/components/student-response-modal";
import type { PublishedSurvey } from "@/lib/published-survey";
import type { SurveyResults } from "@/lib/result-summary";
import { RESULT_TABLES, buildResultTable, type ResultTableType, type TableCell } from "@/lib/result-tables";

function formatCell(cell: TableCell, kind: string) {
  if (cell === null) return "";
  if (kind === "datetime") {
    return new Date(String(cell)).toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return String(cell);
}

export function ResultsExportModal({
  surveyId,
  published,
  results,
  initialType,
  initialClass,
  editable,
  onClose,
}: {
  surveyId: string;
  published: PublishedSurvey;
  results: SurveyResults;
  initialType: ResultTableType;
  initialClass: string;
  editable: boolean;
  onClose: () => void;
}) {
  const [type, setType] = useState(initialType);
  const [classFilter, setClassFilter] = useState(initialClass);
  const [fullScreen, setFullScreen] = useState(false);
  const [editingNo, setEditingNo] = useState<string | null>(null);
  const info = RESULT_TABLES.find((table) => table.type === type)!;
  const appliedClass = info.byClass ? classFilter : "";
  const perStudent = info.byClass;
  const studentByNo = useMemo(
    () => new Map(results.students.map((student) => [student.studentNo, student])),
    [results.students],
  );
  const editingStudent = editingNo ? studentByNo.get(editingNo) : undefined;
  const table = useMemo(
    () => buildResultTable(type, results, published, appliedClass),
    [type, results, published, appliedClass],
  );
  const downloadHref = `/api/surveys/${surveyId}/results/export?type=${type}${appliedClass ? `&class=${appliedClass}` : ""}`;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !editingNo) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [editingNo, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="results-export-title"
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
          <h3 id="results-export-title" className="text-base font-semibold text-zinc-900">
            응답 자료
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

        <div role="tablist" aria-label="자료 종류" className="flex gap-1 overflow-x-auto border-b border-zinc-100 px-5 pt-3">
          {RESULT_TABLES.map((tab) => (
            <button
              key={tab.type}
              type="button"
              role="tab"
              aria-selected={tab.type === type}
              onClick={() => setType(tab.type)}
              className={`shrink-0 rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium ${
                tab.type === type
                  ? "border-violet-700 text-violet-700"
                  : "border-transparent text-zinc-500 hover:text-zinc-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 px-5 py-3">
          {info.byClass ? (
            <select
              value={classFilter}
              onChange={(event) => setClassFilter(event.target.value)}
              aria-label="반"
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800"
            >
              <option value="">전체 반</option>
              {results.classes.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.label}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-zinc-500">제출한 {results.submitted}명 전체 기준</span>
          )}
          <span className="text-sm text-zinc-600">
            {table.rows.length}줄
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-auto border-y border-zinc-100">
          {table.rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-zinc-500">
              {type === "missing" ? "미제출 학생이 없습니다." : "표시할 내용이 없습니다."}
            </p>
          ) : (
            <table className="min-w-max border-separate border-spacing-0 text-left text-xs">
              <thead>
                <tr>
                  {table.columns.map((column, index) => (
                    <th
                      key={column.label}
                      className={`sticky top-0 z-10 border-b border-r border-zinc-200 bg-violet-50 px-3 py-2 font-semibold text-zinc-800 ${
                        index < table.frozenColumns ? "left-0 z-20" : ""
                      } ${index === 0 && table.frozenColumns > 0 ? "w-[4.5rem] min-w-[4.5rem]" : ""} ${
                        index === 1 && table.frozenColumns > 1 ? "left-[4.5rem]" : ""
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
                    {row.map((cell, index) => {
                      const column = table.columns[index];
                      const rowStudent = perStudent && editable && index === 1 ? studentByNo.get(String(row[0])) : undefined;
                      return (
                        <td
                          key={column.label}
                          className={`border-b border-r border-zinc-100 px-3 py-1.5 ${
                            column.kind === "number" ? "text-right tabular-nums" : ""
                          } ${index < table.frozenColumns ? "sticky left-0 bg-white" : ""} ${
                            index === 0 && table.frozenColumns > 0 ? "w-[4.5rem] min-w-[4.5rem] font-mono" : ""
                          } ${index === 1 && table.frozenColumns > 1 ? "left-[4.5rem]" : ""} ${
                            cell === 1 && type === "matrix" && index >= 4 ? "font-semibold text-violet-700" : "text-zinc-700"
                          }`}
                        >
                          {rowStudent ? (
                            <span className="inline-flex items-center gap-2">
                              {formatCell(cell, column.kind)}
                              <button
                                type="button"
                                onClick={() => setEditingNo(rowStudent.studentNo)}
                                className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${
                                  rowStudent.state === "missing"
                                    ? "border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100"
                                    : "border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100"
                                }`}
                              >
                                {rowStudent.state === "missing" ? "입력" : "수정"}
                              </button>
                            </span>
                          ) : (
                            formatCell(cell, column.kind)
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-3">
          <a
            href={downloadHref}
            aria-disabled={table.rows.length === 0}
            className={`rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800 ${
              table.rows.length === 0 ? "pointer-events-none opacity-50" : ""
            }`}
          >
            이 표 엑셀 다운로드
          </a>
        </div>

        {editingStudent ? (
          <StudentResponseModal
            surveyId={surveyId}
            student={editingStudent}
            published={published}
            editable={editable}
            startEditing
            onClose={() => setEditingNo(null)}
          />
        ) : null}
      </div>
    </div>
  );
}
