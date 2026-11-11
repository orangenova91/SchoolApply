"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { ResultsExportModal } from "@/components/results-export-modal";
import { ResultsStudents } from "@/components/results-students";
import { formatDateTime } from "@/components/student-response-modal";
import { TrackBadge } from "@/components/subject-shared";
import { CloseScheduleButton, STATUS_BADGE, SurveyCloseButtons } from "@/components/survey-status-controls";
import type { PublishedSurvey } from "@/lib/published-survey";
import { STATE_LABEL, type ClassResult, type SurveyResults } from "@/lib/result-summary";
import { RESULT_TABLES, type ResultTableType } from "@/lib/result-tables";
import { timingNote, type SurveyStatus, type SurveyTiming } from "@/lib/survey-types";

function percent(part: number, whole: number) {
  return whole ? Math.round((part / whole) * 100) : 0;
}

function formatClock(iso: string) {
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function ClassRow({ entry, onShowStudents }: { entry: ClassResult; onShowStudents: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rate = percent(entry.submitted, entry.total);

  async function copyPending() {
    const names = entry.pending.map((student) => `${student.studentNo} ${student.name}${student.state === "invalid" ? "(다시 제출)" : ""}`);
    await navigator.clipboard.writeText(`${entry.label} 미제출 ${entry.pending.length}명: ${names.join(", ")}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <li className="py-2.5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onShowStudents(entry.key)}
          className="w-24 shrink-0 text-left text-sm font-medium text-zinc-800 hover:text-violet-700"
        >
          {entry.label}
        </button>
        <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-100">
          <div
            className={`h-full rounded-full ${rate === 100 ? "bg-green-500" : "bg-violet-500"}`}
            style={{ width: `${rate}%` }}
          />
        </div>
        <span className="w-20 shrink-0 text-right text-sm tabular-nums text-zinc-700">
          {entry.submitted}/{entry.total}
        </span>
        {entry.pending.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="w-28 shrink-0 rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
          >
            미제출 {entry.pending.length}명 {open ? "▲" : "▼"}
          </button>
        ) : (
          <span className="w-28 shrink-0 text-center text-xs font-medium text-green-700">모두 제출</span>
        )}
      </div>
      {open ? (
        <div className="mt-2 rounded-lg bg-zinc-50 px-3 py-2">
          <ul className="flex flex-wrap gap-1.5">
            {entry.pending.map((student) => (
              <li
                key={student.studentNo}
                className={`rounded-md px-2 py-0.5 text-xs ring-1 ${
                  student.state === "invalid" ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-white text-zinc-700 ring-zinc-200"
                }`}
              >
                {student.studentNo} {student.name}
                {student.state === "invalid" ? ` · ${STATE_LABEL.invalid}` : ""}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={copyPending}
            className="mt-2 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
          >
            {copied ? "복사됨" : "명단 복사"}
          </button>
        </div>
      ) : null}
    </li>
  );
}

export function ResultsView({
  surveyId,
  status,
  timing,
  published,
  results,
  generatedAt,
}: {
  surveyId: string;
  status: SurveyStatus;
  timing: SurveyTiming;
  published: PublishedSurvey;
  results: SurveyResults;
  generatedAt: string;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [classFilter, setClassFilter] = useState("");
  const [exportType, setExportType] = useState<ResultTableType | null>(null);
  const closeExport = useCallback(() => setExportType(null), []);
  const badge = STATUS_BADGE[status];
  const editable = status === "open" || status === "closed";
  const note = timingNote(status, timing);
  const rate = percent(results.submitted, results.total);

  function showStudents(key: string) {
    setClassFilter(key);
    document.getElementById("results-students")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-semibold text-zinc-900">응답 요약</h2>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.tone}`}>{badge.label}</span>
          {note ? <span className="text-xs text-zinc-500">{note}</span> : null}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-400">갱신 {formatClock(generatedAt)}</span>
            <button
              type="button"
              onClick={() => startRefresh(() => router.refresh())}
              disabled={refreshing}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
            >
              {refreshing ? "불러오는 중…" : "새로고침"}
            </button>
            <CloseScheduleButton surveyId={surveyId} status={status} timing={timing} />
            <SurveyCloseButtons surveyId={surveyId} status={status} timing={timing} counts={results} />
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-zinc-50 px-4 py-3">
            <dt className="text-xs text-zinc-500">명단</dt>
            <dd className="mt-1 text-xl font-semibold text-zinc-900">{results.total}명</dd>
          </div>
          <div className="rounded-xl bg-green-50 px-4 py-3">
            <dt className="text-xs text-green-700">제출</dt>
            <dd className="mt-1 text-xl font-semibold text-green-800">
              {results.submitted}명 <span className="text-sm font-medium">({rate}%)</span>
            </dd>
          </div>
          <div className="rounded-xl bg-zinc-50 px-4 py-3">
            <dt className="text-xs text-zinc-500">미제출</dt>
            <dd className="mt-1 text-xl font-semibold text-zinc-900">{results.missing}명</dd>
          </div>
          <div className={`rounded-xl px-4 py-3 ${results.invalid > 0 ? "bg-amber-50" : "bg-zinc-50"}`}>
            <dt className={`text-xs ${results.invalid > 0 ? "text-amber-800" : "text-zinc-500"}`}>다시 제출 필요</dt>
            <dd className={`mt-1 text-xl font-semibold ${results.invalid > 0 ? "text-amber-800" : "text-zinc-900"}`}>
              {results.invalid}명
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-zinc-500">
          {results.lastSubmittedAt ? `마지막 제출·수정 ${formatDateTime(results.lastSubmittedAt)}` : "아직 제출한 학생이 없습니다."}
          {results.invalid > 0 ? " · '다시 제출 필요' 응답은 집계에서 빠집니다." : ""}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-4">
          <span className="mr-1 text-xs font-medium text-zinc-500">자료 보기·엑셀 다운로드</span>
          {RESULT_TABLES.map((table) => (
            <button
              key={table.type}
              type="button"
              onClick={() => setExportType(table.type)}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              {table.label}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-900">① 반별 제출 현황</h2>
        <p className="mt-1 text-xs text-zinc-500">반 이름을 누르면 아래 학생별 응답에서 그 반만 봅니다.</p>
        <ul className="mt-2 divide-y divide-zinc-100">
          {results.classes.map((entry) => (
            <ClassRow key={entry.key} entry={entry} onShowStudents={showStudents} />
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-900">② 과목별 신청 집계</h2>
        <p className="mt-1 text-xs text-zinc-500">제출한 {results.submitted}명 기준 · 신청 인원이 많은 순서</p>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {results.questions.map((question, index) => {
            const max = Math.max(1, ...question.subjects.map((subject) => subject.count));
            return (
              <div key={question.groupId} className="rounded-xl border border-zinc-200 p-4">
                <p className="text-sm font-semibold text-zinc-900">
                  {index + 1}. {question.title}
                  <span className="ml-1 font-normal text-zinc-500">({question.pickCount}과목 택)</span>
                </p>
                <ul className="mt-3 space-y-1.5">
                  {question.subjects.map((subject) => (
                    <li key={subject.id} className="flex items-center gap-2 text-sm">
                      <span className={`w-36 shrink-0 truncate ${subject.count ? "text-zinc-800" : "text-zinc-400"}`} title={subject.subject}>
                        {subject.subject}
                      </span>
                      <span className="w-16 shrink-0">
                        <TrackBadge track={subject.track} />
                      </span>
                      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-100">
                        <div className="h-full rounded-full bg-violet-500" style={{ width: `${(subject.count / max) * 100}%` }} />
                      </div>
                      <span className="w-20 shrink-0 text-right tabular-nums text-zinc-700">
                        {subject.count}명
                        <span className="ml-1 text-xs text-zinc-400">{percent(subject.count, results.submitted)}%</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <div id="results-students" className="scroll-mt-44">
        <ResultsStudents
          surveyId={surveyId}
          published={published}
          students={results.students}
          classes={results.classes}
          classFilter={classFilter}
          editable={editable}
          onClassFilterChange={setClassFilter}
        />
      </div>

      <div className="sticky bottom-0 z-10 rounded-2xl border border-zinc-200 bg-white/95 px-5 py-3 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-zinc-500">
            응답 {results.submitted}/{results.total}명 · 갱신 {formatClock(generatedAt)}
          </p>
          <div className="flex gap-2">
            <Link
              href={`/surveys/${surveyId}/distribute`}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              ← 이전: 설문 배포
            </Link>
            {status === "closed" || status === "assigned" ? (
              <Link
                href={`/surveys/${surveyId}/assign`}
                className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800"
              >
                다음: 반 편성 →
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      {exportType ? (
        <ResultsExportModal
          surveyId={surveyId}
          published={published}
          results={results}
          initialType={exportType}
          initialClass={classFilter}
          editable={editable}
          onClose={closeExport}
        />
      ) : null}
    </div>
  );
}
