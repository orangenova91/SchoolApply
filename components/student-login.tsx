"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { studentLabel } from "@/lib/roster";

const FIELD_CLASS =
  "mt-1 w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base text-zinc-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100";

export function StudentLogin({ token, closed }: { token: string; closed: boolean }) {
  const router = useRouter();
  const [studentNo, setStudentNo] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/s/${token}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentNo, code }),
      });
      const data = (await response.json()) as { name?: string; studentNo?: string; error?: string };
      if (!response.ok || !data.name || !data.studentNo) {
        setError(data.error ?? "로그인하지 못했습니다.");
        return;
      }
      setConfirming(studentLabel(data.studentNo, data.name));
    } catch {
      setError("로그인하지 못했습니다. 네트워크 연결을 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function rejectIdentity() {
    await fetch(`/api/s/${token}/logout`, { method: "POST" });
    setConfirming(null);
    setCode("");
    setError("학번을 다시 확인하고 로그인해 주세요.");
  }

  if (confirming) {
    return (
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm text-zinc-500">본인이 맞는지 확인해 주세요.</p>
        <p className="mt-3 text-xl font-semibold text-zinc-900">{confirming}</p>
        <p className="mt-1 text-sm text-zinc-600">학생이 맞나요?</p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={rejectIdentity}
            className="rounded-xl border border-zinc-300 px-4 py-3 text-base font-medium text-zinc-700 hover:bg-zinc-50"
          >
            아니요
          </button>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="rounded-xl bg-violet-700 px-4 py-3 text-base font-medium text-white hover:bg-violet-800"
          >
            네, 맞습니다
          </button>
        </div>
      </section>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-900">로그인</h2>
      <p className="mt-1 text-sm text-zinc-500">
        {closed
          ? "마감된 설문입니다. 로그인하면 제출한 내용을 확인할 수 있습니다."
          : "선생님께 받은 쪽지의 접속 코드로 로그인하세요."}
      </p>
      <label className="mt-5 block text-sm font-medium text-zinc-700" htmlFor="student-no">
        학번
      </label>
      <input
        id="student-no"
        inputMode="numeric"
        autoComplete="off"
        maxLength={5}
        value={studentNo}
        onChange={(event) => setStudentNo(event.target.value.replace(/\D/g, ""))}
        placeholder="예: 20315"
        className={FIELD_CLASS}
      />
      <label className="mt-4 block text-sm font-medium text-zinc-700" htmlFor="access-code">
        접속 코드
      </label>
      <input
        id="access-code"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={6}
        value={code}
        onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
        placeholder="6자리"
        className={`${FIELD_CLASS} font-mono tracking-[0.3em]`}
      />
      {error ? (
        <p role="alert" className="mt-3 text-sm font-medium text-red-600">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy || studentNo.length < 4 || code.length < 6}
        className="mt-6 w-full rounded-xl bg-violet-700 px-4 py-3 text-base font-medium text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "확인 중…" : "로그인"}
      </button>
    </form>
  );
}
