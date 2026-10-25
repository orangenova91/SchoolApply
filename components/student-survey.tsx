"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TrackBadge } from "@/components/subject-shared";
import { SurveyFormPreview, type PickedSubjects } from "@/components/survey-form-preview";
import type { PublishedSurvey } from "@/lib/published-survey";

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function StudentSurvey({
  token,
  published,
  studentLabel,
  initialPicked,
  initialSubmittedAt,
  initialUpdatedAt,
  answersValid,
  open,
}: {
  token: string;
  published: PublishedSurvey;
  studentLabel: string;
  initialPicked: PickedSubjects;
  initialSubmittedAt: string | null;
  initialUpdatedAt: string | null;
  answersValid: boolean;
  open: boolean;
}) {
  const router = useRouter();
  const hasSubmission = initialSubmittedAt !== null;
  const [picked, setPicked] = useState(initialPicked);
  const [savedPicked, setSavedPicked] = useState(initialPicked);
  const [submittedAt, setSubmittedAt] = useState(initialSubmittedAt);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [editing, setEditing] = useState(open && (!hasSubmission || !answersValid));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const completed = published.questions.filter(
    (question) => (picked[question.groupId] ?? []).length === question.pickCount,
  ).length;
  const allDone = completed === published.questions.length;

  async function logout() {
    await fetch(`/api/s/${token}/logout`, { method: "POST" });
    router.refresh();
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/s/${token}/response`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: published.questions.map((question) => ({
            groupId: question.groupId,
            subjectIds: picked[question.groupId] ?? [],
          })),
        }),
      });
      const data = (await response.json()) as { submittedAt?: string; updatedAt?: string; error?: string };
      if (response.status === 401) {
        setError(data.error ?? "로그인 시간이 지났습니다.");
        router.refresh();
        return;
      }
      if (!response.ok || !data.submittedAt || !data.updatedAt) {
        setError(data.error ?? "제출하지 못했습니다.");
        return;
      }
      setSubmittedAt(data.submittedAt);
      setUpdatedAt(data.updatedAt);
      setSavedPicked(picked);
      setEditing(false);
      window.scrollTo({ top: 0 });
    } catch {
      setError("제출하지 못했습니다. 네트워크 연결을 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm shadow-sm">
        <span className="font-medium text-zinc-900">{studentLabel}</span>
        <button type="button" onClick={logout} className="text-zinc-500 underline-offset-2 hover:underline">
          로그아웃
        </button>
      </div>

      {editing ? (
        <>
          {hasSubmission && !answersValid ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              설문 내용이 바뀌어 이전 응답을 그대로 쓸 수 없습니다. 다시 선택해 제출해 주세요.
            </p>
          ) : null}
          <SurveyFormPreview
            title={published.title}
            description={published.description}
            questions={published.questions}
            value={picked}
            onChange={setPicked}
          />
          <div className="sticky bottom-0 z-10 -mx-4 border-t border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur">
            {error ? (
              <p role="alert" className="mb-2 text-sm font-medium text-red-600">
                {error}
              </p>
            ) : null}
            <div className="flex items-center gap-3">
              <p className="min-w-0 flex-1 text-sm text-zinc-600">
                {allDone ? "모든 문항을 골랐습니다" : `${completed}/${published.questions.length} 문항 완료`}
              </p>
              {submittedAt ? (
                <button
                  type="button"
                  onClick={() => {
                    setPicked(savedPicked);
                    setEditing(false);
                    setError("");
                  }}
                  disabled={busy || !answersValid}
                  className="rounded-xl border border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:hidden"
                >
                  취소
                </button>
              ) : null}
              <button
                type="button"
                onClick={submit}
                disabled={!allDone || busy}
                className="rounded-xl bg-violet-700 px-5 py-3 text-base font-medium text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "제출 중…" : submittedAt ? "수정 제출" : "제출하기"}
              </button>
            </div>
          </div>
        </>
      ) : submittedAt ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="rounded-xl bg-green-50 px-4 py-3 text-green-800">
            <p className="text-base font-semibold">제출 완료</p>
            <p className="mt-0.5 text-sm">
              {formatTime(submittedAt)} 제출
              {updatedAt && updatedAt !== submittedAt ? ` · ${formatTime(updatedAt)} 수정` : ""}
            </p>
          </div>
          <h2 className="mt-5 text-base font-semibold text-zinc-900">{published.title}</h2>
          <ol className="mt-3 space-y-4">
            {published.questions.map((question, index) => {
              const chosen = new Set(savedPicked[question.groupId] ?? []);
              return (
                <li key={question.groupId}>
                  <p className="text-sm font-semibold text-zinc-800">
                    {index + 1}. {question.title}
                  </p>
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {question.subjects
                      .filter((subject) => chosen.has(subject.id))
                      .map((subject) => (
                        <li
                          key={subject.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1 text-sm text-zinc-800"
                        >
                          {subject.subject}
                          <TrackBadge track={subject.track} />
                        </li>
                      ))}
                  </ul>
                </li>
              );
            })}
          </ol>
          {open ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="mt-6 w-full rounded-xl border border-violet-300 px-4 py-3 text-base font-medium text-violet-700 hover:bg-violet-50"
            >
              수정하기
            </button>
          ) : (
            <p className="mt-6 rounded-xl bg-zinc-100 px-4 py-3 text-center text-sm text-zinc-600">
              마감된 설문이라 더 이상 수정할 수 없습니다.
            </p>
          )}
        </section>
      ) : (
        <p className="rounded-2xl border border-zinc-200 bg-white px-4 py-6 text-center text-sm text-zinc-600 shadow-sm">
          마감된 설문입니다. 제출한 응답이 없습니다.
        </p>
      )}
    </div>
  );
}
