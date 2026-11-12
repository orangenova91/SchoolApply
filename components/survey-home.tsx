"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { TimetableImportModal } from "@/components/timetable-import-modal";
import {
  MAX_SURVEY_NOTE,
  STATUS_LABEL,
  SURVEY_ROUNDS,
  type Survey,
  type SurveyRound,
} from "@/lib/survey-types";

const INPUT_CLASS =
  "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function SurveyHome({
  initialSurveys,
  schoolName,
}: {
  initialSurveys: Survey[];
  schoolName: string;
}) {
  const [surveys, setSurveys] = useState(initialSurveys);
  const [academicYear, setAcademicYear] = useState(String(new Date().getFullYear()));
  const [grade, setGrade] = useState("2");
  const [semester, setSemester] = useState<"1" | "2">("1");
  const [round, setRound] = useState<SurveyRound>(1);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Survey | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [listError, setListError] = useState("");
  const [importOpen, setImportOpen] = useState(false);

  const availableRounds = useMemo(() => {
    const year = Number(academicYear);
    const gradeNo = Number(grade);
    const semesterNo = Number(semester);
    const taken = new Set(
      surveys
        .filter(
          (survey) =>
            survey.academicYear === year &&
            survey.grade === gradeNo &&
            survey.semester === semesterNo,
        )
        .map((survey) => survey.round),
    );
    return SURVEY_ROUNDS.filter((value) => !taken.has(value));
  }, [academicYear, grade, semester, surveys]);

  useEffect(() => {
    if (availableRounds.length === 0) return;
    if (!availableRounds.includes(round)) setRound(availableRounds[0]);
  }, [availableRounds, round]);

  async function handleDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleting(true);
    setListError("");
    try {
      const response = await fetch(`/api/surveys/${id}`, { method: "DELETE" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setListError(data.error ?? "조사를 삭제하지 못했습니다.");
        return;
      }
      setSurveys((prev) => prev.filter((survey) => survey.id !== id));
      setDeleteTarget(null);
    } catch {
      setListError("서버에 연결할 수 없습니다.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!availableRounds.includes(round)) {
      setError("이 차수 조사는 이미 있습니다.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          academicYear: Number(academicYear),
          grade: Number(grade),
          semester: Number(semester),
          round,
          note,
        }),
      });
      const data = (await response.json()) as { survey?: Survey; error?: string };
      if (!response.ok || !data.survey) {
        setError(data.error ?? "조사를 만들지 못했습니다.");
        return;
      }
      setSurveys((prev) => [data.survey!, ...prev]);
      setNote("");
    } catch {
      setError("서버에 연결할 수 없습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid w-full grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-900">새 조사</h2>
        <p className="mt-2 text-sm text-zinc-600">
          같은 학년도, 학년, 학기 안에서 차수를 나눠 조사를 만듭니다.
        </p>
        <form onSubmit={handleCreate} className="mt-5 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
            학교
            <input
              readOnly
              value={schoolName}
              aria-label="학교 (로그인한 학교로 고정됨)"
              title="로그인한 학교로 정해집니다."
              className={`${INPUT_CLASS} cursor-not-allowed text-zinc-500`}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
            학년도
            <input
              required
              type="number"
              min={2000}
              max={2100}
              value={academicYear}
              onChange={(event) => setAcademicYear(event.target.value)}
              className={INPUT_CLASS}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
            학년
            <select
              value={grade}
              onChange={(event) => setGrade(event.target.value)}
              className={INPUT_CLASS}
            >
              <option value="1">1학년</option>
              <option value="2">2학년</option>
              <option value="3">3학년</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
            학기
            <select
              value={semester}
              onChange={(event) => setSemester(event.target.value === "2" ? "2" : "1")}
              className={INPUT_CLASS}
            >
              <option value="1">1학기</option>
              <option value="2">2학기</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
            n차 조사
            <select
              value={availableRounds.includes(round) ? String(round) : ""}
              onChange={(event) => setRound(Number(event.target.value) as SurveyRound)}
              disabled={availableRounds.length === 0}
              className={INPUT_CLASS}
            >
              {availableRounds.map((value) => (
                <option key={value} value={value}>
                  {value}차 조사
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
            비고
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={MAX_SURVEY_NOTE}
              rows={3}
              placeholder="선택 입력"
              className={INPUT_CLASS}
            />
          </label>
          <button
            type="submit"
            disabled={saving || availableRounds.length === 0}
            className="mt-1 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "만드는 중…" : "조사 만들기"}
          </button>
          {availableRounds.length === 0 ? (
            <p className="text-sm text-zinc-500">이 학년도, 학년, 학기는 10차까지 모두 만들었습니다.</p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}
        </form>
        <div className="mt-5 border-t border-zinc-100 pt-5">
          <p className="text-sm font-medium text-zinc-800">이미 조사한 결과가 있나요?</p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            timetable_form 엑셀을 가져오면 앞 단계를 거치지 않고 바로 반 편성을 시작할 수 있습니다.
          </p>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="mt-3 w-full rounded-lg border border-violet-300 bg-violet-50 px-4 py-2.5 text-sm font-medium text-violet-700 hover:bg-violet-100"
          >
            조사 결과 가져오기
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold text-zinc-900">조사 목록</h2>
          <span className="text-xs text-zinc-500">{surveys.length}개</span>
        </div>
        {listError ? (
          <p role="alert" className="mb-3 text-sm text-red-600">
            {listError}
          </p>
        ) : null}
        {surveys.length === 0 ? (
          <p className="text-sm text-zinc-500">
            아직 조사가 없습니다. 왼쪽에서 새 조사를 만들어 주세요.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {surveys.map((survey) => (
              <li key={survey.id} className="flex items-start gap-2">
                <Link
                  href={`/surveys/${survey.id}`}
                  className="block min-w-0 flex-1 rounded-lg border-l-2 border-transparent px-2 py-3 transition-colors hover:bg-zinc-50"
                >
                  <p className="flex items-center gap-2 font-medium text-zinc-900">
                    <span className="truncate">
                      {survey.grade}학년 {survey.semester}학기 · {survey.round}차 조사
                    </span>
                    <span className="shrink-0 rounded bg-violet-50 px-1.5 py-0.5 text-xs font-semibold text-violet-700 ring-1 ring-violet-100">
                      {STATUS_LABEL[survey.status]}
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-zinc-600">
                    {survey.school} · {survey.academicYear}학년도
                  </p>
                  {survey.note ? (
                    <p className="mt-1 line-clamp-2 text-sm text-zinc-500">{survey.note}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-zinc-400">{formatDate(survey.createdAt)}</p>
                </Link>
                <div className="flex shrink-0 items-center pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setListError("");
                      setDeleteTarget(survey);
                    }}
                    className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                  >
                    삭제
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {deleteTarget ? (
        <DeleteSurveyModal
          survey={deleteTarget}
          busy={deleting}
          error={listError}
          onClose={() => {
            if (deleting) return;
            setDeleteTarget(null);
            setListError("");
          }}
          onConfirm={() => void handleDelete()}
        />
      ) : null}
      {importOpen ? (
        <TimetableImportModal
          surveys={surveys}
          initialAcademicYear={academicYear}
          initialGrade={grade}
          initialSemester={semester}
          initialRound={round}
          onCreated={(survey) => setSurveys((current) => [survey, ...current])}
          onClose={() => setImportOpen(false)}
        />
      ) : null}
    </div>
  );
}

function DeleteSurveyModal({
  survey,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  survey: Survey;
  busy: boolean;
  error: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const phrase = `${survey.round}차 조사`;
  const canDelete = confirmText.trim() === phrase;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-survey-title"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="delete-survey-title" className="text-base font-semibold text-zinc-900">
          조사 삭제
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-zinc-700">
          {survey.academicYear}학년도 {survey.grade}학년 {survey.semester}학기 {phrase}를
          삭제하면 되돌릴 수 없습니다.
        </p>
        <p className="mt-2 text-sm text-zinc-600">확인을 위해 {phrase}를 정확히 입력하세요.</p>
        <input
          type="text"
          autoFocus
          value={confirmText}
          onChange={(event) => setConfirmText(event.target.value)}
          placeholder={phrase}
          autoComplete="off"
          className={`${INPUT_CLASS} mt-4`}
        />
        {error ? (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {error}
          </p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
          >
            취소
          </button>
          <button
            type="button"
            disabled={busy || !canDelete}
            onClick={onConfirm}
            className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "삭제 중…" : "삭제"}
          </button>
        </div>
      </div>
    </div>
  );
}
