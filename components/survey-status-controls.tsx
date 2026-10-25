"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { formatSeoulTime, type SurveyStatus, type SurveyTiming } from "@/lib/survey-types";

export const STATUS_BADGE: Record<SurveyStatus, { label: string; tone: string }> = {
  preparing: { label: "배포 전", tone: "bg-zinc-100 text-zinc-600" },
  open: { label: "신청 중", tone: "bg-green-50 text-green-700 ring-1 ring-green-200" },
  closed: { label: "마감", tone: "bg-zinc-800 text-white" },
  assigned: { label: "배정 완료", tone: "bg-violet-50 text-violet-700" },
};

function SmallModal({
  title,
  children,
  footer,
  busy,
  onClose,
}: {
  title: string;
  children: ReactNode;
  footer: ReactNode;
  busy: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={busy ? undefined : onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl"
      >
        <h3 className="border-b border-zinc-100 px-5 py-4 text-base font-semibold text-zinc-900">{title}</h3>
        <div className="space-y-3 px-5 py-4 text-sm text-zinc-700">{children}</div>
        <div className="flex items-center justify-end gap-2 border-t border-zinc-100 px-5 py-3">{footer}</div>
      </div>
    </div>
  );
}

const CANCEL_CLASS =
  "rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60";

function ErrorText({ error }: { error: string }) {
  return error ? (
    <p role="alert" className="text-sm font-medium text-red-600">
      {error}
    </p>
  ) : null;
}

function useSurveyRequest() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(url: string, method: "POST" | "PUT", body: unknown, fallback: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? fallback);
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError(`${fallback} 네트워크 연결을 확인해 주세요.`);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, send };
}

export type ResponseCounts = { total: number; submitted: number; missing: number; invalid: number };

function CloseSurveyModal({
  surveyId,
  timing,
  counts,
  onClose,
}: {
  surveyId: string;
  timing: SurveyTiming;
  counts: ResponseCounts;
  onClose: () => void;
}) {
  const { busy, error, send } = useSurveyRequest();
  const allDone = counts.missing === 0 && counts.invalid === 0;

  async function confirm() {
    if (await send(`/api/surveys/${surveyId}/status`, "POST", { action: "close" }, "설문을 마감하지 못했습니다.")) {
      onClose();
    }
  }

  return (
    <SmallModal
      title="설문을 마감할까요?"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={CANCEL_CLASS}>
            취소
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60"
          >
            {busy ? "마감 중…" : "마감하기"}
          </button>
        </>
      }
    >
      <dl className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-green-50 px-2 py-2">
          <dt className="text-xs text-green-700">제출</dt>
          <dd className="font-semibold text-green-800">
            {counts.submitted}/{counts.total}명
          </dd>
        </div>
        <div className={`rounded-lg px-2 py-2 ${counts.missing ? "bg-orange-50" : "bg-zinc-50"}`}>
          <dt className={`text-xs ${counts.missing ? "text-orange-700" : "text-zinc-500"}`}>미제출</dt>
          <dd className={`font-semibold ${counts.missing ? "text-orange-800" : "text-zinc-900"}`}>{counts.missing}명</dd>
        </div>
        <div className={`rounded-lg px-2 py-2 ${counts.invalid ? "bg-amber-50" : "bg-zinc-50"}`}>
          <dt className={`text-xs ${counts.invalid ? "text-amber-800" : "text-zinc-500"}`}>다시 제출 필요</dt>
          <dd className={`font-semibold ${counts.invalid ? "text-amber-800" : "text-zinc-900"}`}>{counts.invalid}명</dd>
        </div>
      </dl>
      <p>{allDone ? "모든 학생이 제출했습니다." : "아직 응답을 마치지 않은 학생이 있습니다."}</p>
      <p className="text-zinc-600">
        마감하면 학생은 더 이상 제출하거나 수정할 수 없습니다.
        {allDone ? "" : " 마감한 뒤에도 선생님이 응답을 수정하거나 미제출 학생 대신 입력할 수 있습니다."}
      </p>
      {timing.closesAt ? (
        <p className="text-xs text-zinc-500">예약한 마감({formatSeoulTime(timing.closesAt)})보다 먼저 마감합니다.</p>
      ) : null}
      <ErrorText error={error} />
    </SmallModal>
  );
}

function ReopenSurveyModal({
  surveyId,
  timing,
  onClose,
}: {
  surveyId: string;
  timing: SurveyTiming;
  onClose: () => void;
}) {
  const { busy, error, send } = useSurveyRequest();
  const [scheduleAhead] = useState(() =>
    timing.closesAt && Date.parse(timing.closesAt) > Date.now() ? timing.closesAt : null,
  );

  async function confirm() {
    if (await send(`/api/surveys/${surveyId}/status`, "POST", { action: "reopen" }, "설문을 다시 열지 못했습니다.")) {
      onClose();
    }
  }

  return (
    <SmallModal
      title="설문을 다시 열까요?"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={CANCEL_CLASS}>
            취소
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800 disabled:opacity-60"
          >
            {busy ? "여는 중…" : "다시 열기"}
          </button>
        </>
      }
    >
      <p>다시 열면 학생이 다시 제출하고 응답을 수정할 수 있습니다.</p>
      <p className="text-zinc-600">
        {scheduleAhead
          ? `예약한 마감(${formatSeoulTime(scheduleAhead)})은 그대로 남습니다.`
          : timing.closesAt
            ? "지난 예약 마감 시각은 지워집니다. 필요하면 다시 예약해 주세요."
            : "필요하면 다시 연 뒤 예약 마감을 정해 주세요."}
      </p>
      <ErrorText error={error} />
    </SmallModal>
  );
}

/** datetime-local 입력값(브라우저 시간대)과 ISO 시각을 오간다. */
function toLocalInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultScheduleInput(closesAt?: string) {
  if (closesAt) return toLocalInput(new Date(closesAt));
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(17, 0, 0, 0);
  return toLocalInput(tomorrow);
}

function CloseScheduleModal({
  surveyId,
  closesAt,
  onClose,
}: {
  surveyId: string;
  closesAt?: string;
  onClose: () => void;
}) {
  const { busy, error, send } = useSurveyRequest();
  const [value, setValue] = useState(() => defaultScheduleInput(closesAt));
  const [minValue] = useState(() => toLocalInput(new Date()));
  const url = `/api/surveys/${surveyId}/close-schedule`;

  async function save() {
    const time = new Date(value);
    if (Number.isNaN(time.getTime())) return;
    if (await send(url, "PUT", { closesAt: time.toISOString() }, "예약 마감을 저장하지 못했습니다.")) onClose();
  }

  async function clear() {
    if (await send(url, "PUT", { closesAt: null }, "예약 마감을 해제하지 못했습니다.")) onClose();
  }

  return (
    <SmallModal
      title="예약 마감"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          {closesAt ? (
            <button
              type="button"
              onClick={clear}
              disabled={busy}
              className="mr-auto rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
            >
              예약 해제
            </button>
          ) : null}
          <button type="button" onClick={onClose} disabled={busy} className={CANCEL_CLASS}>
            취소
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy || !value}
            className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800 disabled:opacity-60"
          >
            {busy ? "저장 중…" : "저장"}
          </button>
        </>
      }
    >
      <p>정한 시각이 지나면 설문이 자동으로 마감됩니다. 학생 화면에도 마감 시각이 보입니다.</p>
      <label className="block">
        <span className="text-xs font-medium text-zinc-500">마감 시각</span>
        <input
          type="datetime-local"
          value={value}
          min={minValue}
          onChange={(event) => setValue(event.target.value)}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
        />
      </label>
      {value && !Number.isNaN(new Date(value).getTime()) ? (
        <p className="text-xs text-zinc-500">{formatSeoulTime(new Date(value).toISOString())}에 마감합니다.</p>
      ) : null}
      <ErrorText error={error} />
    </SmallModal>
  );
}

const OUTLINE_CLASS =
  "rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50";

/** 준비·신청 중일 때 예약 마감을 정하거나 바꾸는 버튼 */
export function CloseScheduleButton({
  surveyId,
  status,
  timing,
  className = OUTLINE_CLASS,
}: {
  surveyId: string;
  status: SurveyStatus;
  timing: SurveyTiming;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  if (status !== "preparing" && status !== "open") return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {timing.closesAt ? "예약 마감 변경" : "예약 마감"}
      </button>
      {open ? <CloseScheduleModal surveyId={surveyId} closesAt={timing.closesAt} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** 신청 중이면 마감, 마감이면 다시 열기 버튼. 확인은 작은 모달에서 받는다. */
export function SurveyCloseButtons({
  surveyId,
  status,
  timing,
  counts,
}: {
  surveyId: string;
  status: SurveyStatus;
  timing: SurveyTiming;
  counts: ResponseCounts;
}) {
  const [modal, setModal] = useState<"close" | "reopen" | null>(null);
  const closeModal = () => setModal(null);
  if (status !== "open" && status !== "closed") return null;
  return (
    <>
      {status === "open" ? (
        <button
          type="button"
          onClick={() => setModal("close")}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
        >
          마감
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setModal("reopen")}
          className="rounded-lg bg-violet-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-800"
        >
          다시 열기
        </button>
      )}
      {modal === "close" ? (
        <CloseSurveyModal surveyId={surveyId} timing={timing} counts={counts} onClose={closeModal} />
      ) : null}
      {modal === "reopen" ? <ReopenSurveyModal surveyId={surveyId} timing={timing} onClose={closeModal} /> : null}
    </>
  );
}
