import type { Metadata } from "next";
import Link from "next/link";
import { AccountRequestForm } from "@/components/account-request-form";
import { APP_VERSION } from "@/lib/app-version";

export const metadata: Metadata = {
  title: "계정 신청 · 스쿨어플라이(SchoolApply)",
};

export default function ApplyPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-16">
      <main className="flex w-full max-w-md flex-col items-center gap-8">
        <header className="text-center">
          <div className="flex items-center justify-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-violet-700 text-sm font-semibold text-white">
              A
            </span>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
              스쿨어플라이(
              <span className="text-[#2D4B7C]">School</span>
              <span className="text-violet-700">Apply</span>)
            </h1>
          </div>
          <p className="mt-1 flex items-center justify-center gap-2 text-base font-medium text-zinc-800">
            계정 신청
            <span className="text-xs font-medium text-zinc-500">{APP_VERSION}</span>
          </p>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600">
            학교를 검색하면 지역과 학교급이 자동으로 표시됩니다. 담당 교사 정보를 입력해 주세요.
          </p>
        </header>
        <AccountRequestForm />
        <Link href="/login" className="text-sm font-medium text-zinc-600 transition hover:text-zinc-900">
          ← 로그인으로
        </Link>
      </main>
    </div>
  );
}
