"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CloseScheduleButton, STATUS_BADGE } from "@/components/survey-status-controls";
import { timingNote, type SurveyStatus, type SurveyTiming } from "@/lib/survey-types";

type Action = "open" | "close" | "reopen" | "revert";

export function DistributionStatusCard({
  surveyId,
  surveyUrl,
  status,
  timing,
  respondentCount,
  responseCount,
  imported = false,
}: {
  surveyId: string;
  surveyUrl: string;
  status: SurveyStatus;
  timing: SurveyTiming;
  respondentCount: number;
  responseCount: number;
  imported?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState("");

  async function run(action: Action, confirmMessage: string) {
    if (!window.confirm(confirmMessage)) return;
    setBusy(action);
    setError("");
    try {
      const response = await fetch(`/api/surveys/${surveyId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "배포 상태를 바꾸지 못했습니다.");
        return;
      }
      router.refresh();
    } catch {
      setError("배포 상태를 바꾸지 못했습니다. 네트워크 연결을 확인해 주세요.");
    } finally {
      setBusy(null);
    }
  }

  const badge = STATUS_BADGE[status];
  const note = timingNote(status, timing);
  const revertMessage =
    responseCount > 0
      ? `준비 상태로 되돌리면 학생이 접속할 수 없게 되고, 편성과 설문지를 다시 수정할 수 있습니다. 이미 제출된 응답 ${responseCount}건은 남지만, 설문 내용을 바꾸면 학생이 다시 제출해야 할 수 있습니다. 되돌릴까요?`
      : "준비 상태로 되돌리면 학생이 접속할 수 없게 되고, 편성과 설문지를 다시 수정할 수 있습니다. 되돌릴까요?";

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-base font-semibold text-zinc-900">③ 배포</h2>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.tone}`}>{badge.label}</span>
        {note ? <span className="text-xs text-zinc-500">{note}</span> : null}
        <span className="ml-auto text-sm text-zinc-500">
          응답 <span className="font-semibold text-zinc-900">{responseCount}</span> / 명단 {respondentCount}명
        </span>
      </div>
      <p className="mt-2 text-sm text-zinc-600">
        {imported
          ? "timetable_form에서 가져온 마감 조사입니다. 학생에게 배포하거나 다시 열지 않고 응답 확인과 반 편성을 진행합니다."
          : status === "preparing"
          ? "배포를 시작하면 학생이 설문 주소로 접속해 응답할 수 있습니다. 시작한 뒤에는 선택과목 편성과 설문지 양식을 수정할 수 없습니다."
          : status === "open"
            ? "학생들이 응답하고 있습니다. 마감하면 더 이상 제출하거나 수정할 수 없습니다."
            : "마감되었습니다. 학생은 로그인해서 제출한 내용만 볼 수 있습니다."}
      </p>
      {error ? (
        <p role="alert" className="mt-2 text-sm font-medium text-red-600">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {imported ? (
          <span className="rounded-lg bg-violet-50 px-3 py-2 text-sm font-medium text-violet-700">
            엑셀에서 가져옴 · 배포 단계 생략
          </span>
        ) : null}
        {!imported && status === "preparing" ? (
          <button
            type="button"
            disabled={busy !== null || respondentCount === 0}
            onClick={() =>
              run("open", "배포를 시작할까요? 시작하면 선택과목 편성과 설문지 양식을 수정할 수 없습니다.")
            }
            className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === "open" ? "시작 중…" : "배포 시작"}
          </button>
        ) : null}
        {!imported && status === "open" ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run("close", "설문을 마감할까요? 학생은 더 이상 제출하거나 수정할 수 없습니다.")}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {busy === "close" ? "마감 중…" : "마감"}
          </button>
        ) : null}
        {!imported && status === "closed" ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run("reopen", "설문을 다시 열까요? 학생이 다시 제출하고 수정할 수 있게 됩니다.")}
            className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800 disabled:opacity-50"
          >
            {busy === "reopen" ? "여는 중…" : "다시 열기"}
          </button>
        ) : null}
        {!imported ? (
          <CloseScheduleButton
            surveyId={surveyId}
            status={status}
            timing={timing}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          />
        ) : null}
        {!imported && (status === "open" || status === "closed") ? (
          <>
            <a
              href={surveyUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              설문 주소 열기
            </a>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => run("revert", revertMessage)}
              className="ml-auto rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {busy === "revert" ? "되돌리는 중…" : "준비 상태로 되돌리기"}
            </button>
          </>
        ) : null}
        {status === "preparing" && respondentCount === 0 ? (
          <span className="text-xs text-zinc-400">학생 명단을 올린 뒤 시작할 수 있습니다.</span>
        ) : null}
      </div>
    </section>
  );
}
