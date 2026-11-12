"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  FORM_LIMITS,
} from "@/lib/survey-form";
import {
  MAX_SURVEY_NOTE,
  SURVEY_ROUNDS,
  type Survey,
  type SurveyRound,
} from "@/lib/survey-types";
import type {
  TimetableImportPreview,
  TimetableImportQuestionConfig,
} from "@/lib/timetable-import-types";

const INPUT_CLASS =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:bg-zinc-100";
const SECONDARY_BUTTON =
  "rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50";

const TEMPLATE_URL = "/api/surveys/import/template";

type CreatedResult = {
  survey: Survey;
  imported: number;
  excluded: number;
  excludedExamples: { studentNo: string; name: string; reason: string }[];
};

export function TimetableImportModal({
  surveys,
  initialAcademicYear,
  initialGrade,
  initialSemester,
  initialRound,
  onCreated,
  onClose,
}: {
  surveys: Survey[];
  initialAcademicYear: string;
  initialGrade: string;
  initialSemester: "1" | "2";
  initialRound: SurveyRound;
  onCreated: (survey: Survey) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<TimetableImportPreview | null>(null);
  const [questions, setQuestions] = useState<TimetableImportQuestionConfig[]>([]);
  const [academicYear, setAcademicYear] = useState(initialAcademicYear);
  const [grade, setGrade] = useState(initialGrade);
  const [semester, setSemester] = useState(initialSemester);
  const [round, setRound] = useState<SurveyRound>(initialRound);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"preview" | "create" | null>(null);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<CreatedResult | null>(null);

  const availableRounds = useMemo(() => {
    const taken = new Set(
      surveys
        .filter(
          (survey) =>
            survey.academicYear === Number(academicYear) &&
            survey.grade === Number(grade) &&
            survey.semester === Number(semester),
        )
        .map((survey) => survey.round),
    );
    return SURVEY_ROUNDS.filter((value) => !taken.has(value));
  }, [surveys, academicYear, grade, semester]);

  const selectedRound = availableRounds.includes(round) ? round : availableRounds[0];

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
    setPreview(null);
    setQuestions([]);
    setCreated(null);
    setError("");
  }

  async function analyze() {
    if (!file) {
      setError("timetable_form 엑셀 파일을 선택해 주세요.");
      return;
    }
    setBusy("preview");
    setError("");
    const data = new FormData();
    data.set("action", "preview");
    data.set("file", file);
    try {
      const response = await fetch("/api/surveys/import", { method: "POST", body: data });
      const result = (await response.json()) as { preview?: TimetableImportPreview; error?: string };
      if (!response.ok || !result.preview) {
        setError(result.error ?? "엑셀을 분석하지 못했습니다.");
        return;
      }
      setPreview(result.preview);
      setQuestions(
        result.preview.questions.map((question) => ({
          groupId: question.groupId,
          title: question.title,
          pickCount: question.suggestedPickCount,
        })),
      );
    } catch {
      setError("서버에 연결할 수 없습니다.");
    } finally {
      setBusy(null);
    }
  }

  function updateQuestion(groupId: number, patch: Partial<TimetableImportQuestionConfig>) {
    setQuestions((current) =>
      current.map((question) => (question.groupId === groupId ? { ...question, ...patch } : question)),
    );
  }

  async function create() {
    if (!file || !preview) return;
    if (selectedRound === undefined) {
      setError("이 학년도, 학년, 학기는 10차까지 모두 만들었습니다.");
      return;
    }
    setBusy("create");
    setError("");
    const data = new FormData();
    data.set("action", "create");
    data.set("file", file);
    data.set("academicYear", academicYear);
    data.set("grade", grade);
    data.set("semester", semester);
    data.set("round", String(selectedRound));
    data.set("note", note);
    data.set("questions", JSON.stringify(questions));
    try {
      const response = await fetch("/api/surveys/import", { method: "POST", body: data });
      const result = (await response.json()) as CreatedResult & { error?: string };
      if (!response.ok || !result.survey) {
        setError(result.error ?? "조사를 만들지 못했습니다.");
        return;
      }
      onCreated(result.survey);
      if (result.excluded === 0) {
        router.push(`/surveys/${result.survey.id}/assign`);
        return;
      }
      setCreated(result);
    } catch {
      setError("서버에 연결할 수 없습니다.");
    } finally {
      setBusy(null);
    }
  }

  const gradeMismatch =
    preview &&
    Object.entries(preview.gradeCounts)
      .filter(([studentGrade]) => studentGrade !== grade)
      .reduce((sum, [, count]) => sum + count, 0);
  const mismatchedResponses = preview
    ? preview.questions.map((question) => {
        const config = questions.find((item) => item.groupId === question.groupId);
        return Object.entries(question.selectionCounts).reduce(
          (sum, [count, students]) => sum + (Number(count) === config?.pickCount ? 0 : students),
          0,
        );
      })
    : [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="timetable-import-title"
      onClick={busy ? undefined : onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-5 py-4">
          <div>
            <h2 id="timetable-import-title" className="text-base font-semibold text-zinc-900">
              조사 결과 가져오기
            </h2>
            <p className="mt-1 text-sm text-zinc-600">
              timetable_form 엑셀을 분석해 마감 상태의 조사를 만들고 바로 반 편성을 시작합니다.
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={busy !== null} className={SECONDARY_BUTTON}>
            닫기
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {created ? (
            <CreatedNotice result={created} />
          ) : (
            <div className="space-y-6">
              <section>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                  <span>
                    1행 문항(제목에 학기와 [택N]), 2행 과목, 4행부터 학번·이름과 선택한 과목 칸에 1을 적습니다.
                  </span>
                  <a
                    href={TEMPLATE_URL}
                    download
                    className="shrink-0 rounded-md border border-zinc-300 bg-white px-2.5 py-1 font-medium text-zinc-700 hover:bg-zinc-100"
                  >
                    양식 내려받기
                  </a>
                </div>
                <label className="block text-sm font-medium text-zinc-800">
                  timetable_form 엑셀
                  <input
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={chooseFile}
                    disabled={busy !== null}
                    className="mt-2 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 file:mr-3 file:rounded-md file:border-0 file:bg-violet-50 file:px-3 file:py-1.5 file:font-medium file:text-violet-700"
                  />
                </label>
                <div className="mt-3 flex items-center gap-3">
                  <button type="button" onClick={() => void analyze()} disabled={!file || busy !== null} className={SECONDARY_BUTTON}>
                    {busy === "preview" ? "분석 중…" : preview ? "다시 분석" : "엑셀 분석"}
                  </button>
                  {preview ? (
                    <span className="text-sm text-green-700">
                      {preview.studentCount}명 · 문항 {preview.questions.length}개 · {preview.studentNoFormat}자리 학번
                    </span>
                  ) : null}
                </div>
              </section>

              {preview ? (
                <>
                  {preview.issues.length > 0 ? (
                    <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                      <h3 className="text-sm font-semibold text-amber-900">
                        엑셀에서 제외한 행 또는 확인할 내용 {preview.issues.length}건
                      </h3>
                      <ul className="mt-2 max-h-32 list-inside list-disc overflow-y-auto text-xs text-amber-800">
                        {preview.issues.map((issue, index) => (
                          <li key={`${issue}-${index}`}>{issue}</li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  <section>
                    <h3 className="text-sm font-semibold text-zinc-900">조사 정보</h3>
                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <label className="text-sm font-medium text-zinc-700">
                        학년도
                        <input
                          type="number"
                          min={2000}
                          max={2100}
                          value={academicYear}
                          onChange={(event) => setAcademicYear(event.target.value)}
                          className={`${INPUT_CLASS} mt-1`}
                        />
                      </label>
                      <label className="text-sm font-medium text-zinc-700">
                        학년
                        <select value={grade} onChange={(event) => setGrade(event.target.value)} className={`${INPUT_CLASS} mt-1`}>
                          <option value="1">1학년</option>
                          <option value="2">2학년</option>
                          <option value="3">3학년</option>
                        </select>
                      </label>
                      <label className="text-sm font-medium text-zinc-700">
                        학기
                        <select value={semester} onChange={(event) => setSemester(event.target.value === "2" ? "2" : "1")} className={`${INPUT_CLASS} mt-1`}>
                          <option value="1">1학기</option>
                          <option value="2">2학기</option>
                        </select>
                      </label>
                      <label className="text-sm font-medium text-zinc-700">
                        차수
                        <select
                          value={selectedRound ?? ""}
                          onChange={(event) => setRound(Number(event.target.value) as SurveyRound)}
                          disabled={availableRounds.length === 0}
                          className={`${INPUT_CLASS} mt-1`}
                        >
                          {availableRounds.map((value) => (
                            <option key={value} value={value}>{value}차 조사</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="mt-3 block text-sm font-medium text-zinc-700">
                      비고
                      <input
                        value={note}
                        maxLength={MAX_SURVEY_NOTE}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder="선택 입력"
                        className={`${INPUT_CLASS} mt-1`}
                      />
                    </label>
                    {gradeMismatch ? (
                      <p className="mt-2 text-sm text-amber-700">
                        선택한 {grade}학년과 학번 첫 자리의 학년이 다른 학생이 {gradeMismatch}명입니다. 학번은 엑셀 값 그대로 저장됩니다.
                      </p>
                    ) : null}
                  </section>

                  <section>
                    <h3 className="text-sm font-semibold text-zinc-900">문항과 선택 개수</h3>
                    <p className="mt-1 text-xs text-zinc-500">
                      엑셀의 [택N] 값을 기본으로 넣었습니다. 선택 개수를 바꾸면 맞지 않는 응답은 미제출로 남습니다.
                    </p>
                    <div className="mt-3 space-y-3">
                      {preview.questions.map((question, index) => {
                        const config = questions.find((item) => item.groupId === question.groupId)!;
                        return (
                          <div key={question.groupId} className="rounded-xl border border-zinc-200 p-4">
                            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
                              <label className="text-xs font-medium text-zinc-600">
                                {index + 1}번 문항 제목
                                <input
                                  value={config.title}
                                  maxLength={FORM_LIMITS.questionTitle}
                                  onChange={(event) => updateQuestion(question.groupId, { title: event.target.value })}
                                  className={`${INPUT_CLASS} mt-1`}
                                />
                              </label>
                              <label className="text-xs font-medium text-zinc-600">
                                학생당 선택 개수
                                <input
                                  type="number"
                                  min={1}
                                  max={question.subjects.length}
                                  value={config.pickCount}
                                  onChange={(event) =>
                                    updateQuestion(question.groupId, { pickCount: Number(event.target.value) })
                                  }
                                  className={`${INPUT_CLASS} mt-1`}
                                />
                              </label>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
                              <span>과목 {question.subjects.length}개</span>
                              <span>
                                실제 선택 수:{" "}
                                {Object.entries(question.selectionCounts)
                                  .sort(([left], [right]) => Number(left) - Number(right))
                                  .map(([count, students]) => `${count}개 ${students}명`)
                                  .join(" · ")}
                              </span>
                              {mismatchedResponses[index] > 0 ? (
                                <span className="font-medium text-amber-700">
                                  이 문항이 맞지 않는 학생 {mismatchedResponses[index]}명
                                </span>
                              ) : (
                                <span className="font-medium text-green-700">모두 일치</span>
                              )}
                            </div>
                            <details className="mt-2 text-xs text-zinc-600">
                              <summary className="cursor-pointer font-medium">과목별 선택 인원 보기</summary>
                              <div className="mt-2 grid gap-1 sm:grid-cols-2">
                                {question.subjects.map((subject) => (
                                  <span key={subject.subject}>
                                    {subject.subject} · {subject.demand}명
                                    <span className="text-zinc-400"> ({subject.track})</span>
                                  </span>
                                ))}
                              </div>
                            </details>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                </>
              ) : null}

              {error ? <p role="alert" className="text-sm font-medium text-red-600">{error}</p> : null}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-100 px-5 py-3">
          {created ? (
            <>
              <button type="button" onClick={() => router.push(`/surveys/${created.survey.id}/results`)} className={SECONDARY_BUTTON}>
                응답 확인
              </button>
              <button
                type="button"
                onClick={() => router.push(`/surveys/${created.survey.id}/assign`)}
                className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800"
              >
                반 편성으로
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={onClose} disabled={busy !== null} className={SECONDARY_BUTTON}>취소</button>
              <button
                type="button"
                onClick={() => void create()}
                disabled={!preview || busy !== null || availableRounds.length === 0}
                className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === "create" ? "만드는 중…" : "마감 조사 만들고 반 편성으로"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CreatedNotice({ result }: { result: CreatedResult }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-green-200 bg-green-50 p-4">
        <h3 className="font-semibold text-green-900">마감 상태의 조사를 만들었습니다.</h3>
        <p className="mt-1 text-sm text-green-800">정상 응답 {result.imported}명을 가져왔습니다.</p>
      </div>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <h3 className="font-semibold text-amber-900">선택 개수가 맞지 않아 미제출로 남긴 학생 {result.excluded}명</h3>
        <p className="mt-1 text-sm text-amber-800">
          응답 확인에서 교사가 내용을 입력한 뒤 반 편성을 실행해 주세요.
        </p>
        <ul className="mt-2 max-h-52 list-inside list-disc overflow-y-auto text-xs text-amber-800">
          {result.excludedExamples.map((item) => (
            <li key={item.studentNo}>{item.studentNo} {item.name} · {item.reason}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
