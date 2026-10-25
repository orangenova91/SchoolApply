"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { RespondentView } from "@/lib/respondents";
import { classKey, classLabel } from "@/lib/roster";

/** 인쇄할 때는 body 아래에서 이 요소만 남긴다 (globals.css의 slip-printing 규칙). */
const PRINT_ROOT_ID = "slip-print-root";

export function SlipPrintModal({
  formTitle,
  surveyUrl,
  qrDataUrl,
  respondents,
  classCounts,
  initialClass,
  onClose,
}: {
  formTitle: string;
  surveyUrl: string;
  qrDataUrl: string;
  respondents: RespondentView[];
  classCounts: [string, number][];
  initialClass: string;
  onClose: () => void;
}) {
  const [classFilter, setClassFilter] = useState(initialClass);
  const selected = classFilter
    ? respondents.filter((respondent) => classKey(respondent.studentNo) === classFilter)
    : respondents;
  const byClass = new Map<string, RespondentView[]>();
  for (const respondent of selected) {
    const key = classKey(respondent.studentNo);
    byClass.set(key, [...(byClass.get(key) ?? []), respondent]);
  }

  useEffect(() => {
    document.body.classList.add("slip-printing");
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("slip-printing");
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div
      id={PRINT_ROOT_ID}
      role="dialog"
      aria-modal="true"
      aria-labelledby="slip-print-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:static print:block print:bg-white print:p-0"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl print:max-h-none print:overflow-visible print:rounded-none print:border-0 print:shadow-none"
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-zinc-100 px-5 py-4 print:hidden">
          <div className="mr-auto">
            <h3 id="slip-print-title" className="text-base font-semibold text-zinc-900">
              접속 코드 쪽지
            </h3>
            <p className="mt-0.5 text-sm text-zinc-500">{selected.length}명 · 점선을 따라 잘라 나눠 주세요.</p>
          </div>
          <select
            value={classFilter}
            onChange={(event) => setClassFilter(event.target.value)}
            aria-label="인쇄할 반"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
          >
            <option value="">전체 ({respondents.length}명)</option>
            {classCounts.map(([key, count]) => (
              <option key={key} value={key}>
                {classLabel(key)} ({count}명)
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={selected.length === 0}
            className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            인쇄
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-zinc-50 p-5 print:overflow-visible print:bg-white print:p-0">
          {selected.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">출력할 학생이 없습니다.</p>
          ) : null}
          {[...byClass.entries()].map(([key, students], index) => (
            <section key={key} className={index > 0 ? "mt-6 break-before-page print:mt-0" : ""}>
              <h4 className="mb-2 text-sm font-semibold text-zinc-700">{classLabel(key)}</h4>
              <div className="grid grid-cols-2 border-l border-t border-dashed border-zinc-400 bg-white">
                {students.map((student) => (
                  <div
                    key={student.studentNo}
                    className="flex break-inside-avoid items-center gap-3 border-b border-r border-dashed border-zinc-400 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] text-zinc-500">{formTitle}</p>
                      <p className="mt-1 text-sm text-zinc-900">
                        <span className="font-mono">{student.studentNo}</span>
                        <span className="ml-2 font-semibold">{student.name}</span>
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">접속 코드</p>
                      <p className="font-mono text-xl font-bold tracking-[0.3em] text-zinc-900">{student.code}</p>
                      <p className="mt-1 truncate font-mono text-[10px] text-zinc-500">{surveyUrl}</p>
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrDataUrl} alt="" className="size-16 shrink-0" />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
