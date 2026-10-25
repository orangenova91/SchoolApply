"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const STEPS = [
  { key: "arrangement", label: "선택과목 편성", path: "" },
  { key: "form", label: "설문지 양식", path: "/form" },
  { key: "distribute", label: "설문 배포", path: "/distribute" },
  { key: "results", label: "응답 확인", path: "/results" },
] as const;

function currentStepIndex(pathname: string) {
  const segments = pathname.split("/");
  const index = STEPS.findIndex((step) => step.path && segments.includes(step.path.slice(1)));
  return index === -1 ? 0 : index;
}

export function SurveyFlowStepper({
  surveyId,
  surveyLabel,
  roundLabel,
  surveyDetail,
  reachedStep,
}: {
  surveyId: string;
  surveyLabel: string;
  roundLabel: string;
  surveyDetail: string;
  /** 이동할 수 있는 가장 먼 단계 번호 (0부터) */
  reachedStep: number;
}) {
  const current = currentStepIndex(usePathname());
  const [visitedMax, setVisitedMax] = useState(reachedStep);
  if (current > visitedMax) setVisitedMax(current);
  const maxReached = Math.max(visitedMax, reachedStep);

  return (
    <div className="sticky top-[53px] z-40 border-b border-zinc-200 bg-white print:hidden">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-4 pt-2.5">
        <Link href="/" className="justify-self-start text-sm font-medium text-zinc-500 hover:text-zinc-800">
          ← 조사 목록
        </Link>
        <p
          className="flex max-w-[40rem] min-w-0 items-center justify-center gap-2 text-sm text-zinc-600"
          title={[surveyLabel, roundLabel, surveyDetail].filter(Boolean).join(" · ")}
        >
          <span className="shrink-0">{surveyLabel}</span>
          <span className="shrink-0 rounded bg-violet-50 px-1.5 py-0.5 text-xs font-semibold text-violet-700 ring-1 ring-violet-100">
            {roundLabel}
          </span>
          {surveyDetail ? <span className="min-w-0 truncate text-zinc-500">{surveyDetail}</span> : null}
        </p>
        <span />
      </div>
      <div className="mx-auto w-full max-w-6xl overflow-x-auto px-4 pb-4 pt-2">
        <ol className="flex min-w-max items-start justify-center gap-1.5">
          {STEPS.map((step, index) => {
            const status = index < current ? "done" : index === current ? "current" : "upcoming";
            const canJump = status !== "current" && index <= maxReached;
            const isLast = index === STEPS.length - 1;
            const circle =
              status === "current"
                ? "bg-violet-700 text-white"
                : status === "done"
                  ? "bg-violet-100 text-violet-700 hover:bg-violet-200"
                  : canJump
                    ? "border border-violet-300 bg-white text-violet-700 hover:bg-violet-50"
                    : "border border-zinc-300 bg-white text-zinc-400";

            return (
              <li key={step.key} className="flex items-start">
                <div className="flex w-24 flex-col items-center gap-1.5 text-center">
                  {canJump ? (
                    <Link
                      href={`/surveys/${surveyId}${step.path}`}
                      aria-label={status === "done" ? `${step.label} (완료, 다시 보기)` : `${step.label}로 이동`}
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition ${circle}`}
                    >
                      {status === "done" ? "✓" : index + 1}
                    </Link>
                  ) : (
                    <div
                      aria-current={status === "current" ? "step" : undefined}
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${circle}`}
                    >
                      {index + 1}
                    </div>
                  )}
                  <span
                    className={`text-xs leading-tight ${
                      status === "current"
                        ? "font-semibold text-violet-700"
                        : canJump
                          ? "text-zinc-600"
                          : "text-zinc-400"
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {!isLast ? (
                  <div
                    className={`mt-3.5 h-px w-8 shrink-0 sm:w-16 ${
                      index < maxReached ? "bg-violet-300" : "bg-zinc-200"
                    }`}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
