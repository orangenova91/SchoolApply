import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { APP_VERSION } from "@/lib/app-version";
import { getServerSession } from "@/lib/session";

export default async function LoginPage() {
  const session = await getServerSession();
  if (session?.role === "admin") redirect("/admin");
  if (session) redirect("/");

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-16">
      <main className="flex w-full max-w-sm flex-col items-center gap-8">
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
            선택과목 신청 · 반 배정
            <span className="text-xs font-medium text-zinc-500">{APP_VERSION}</span>
          </p>
          <p className="mt-2 text-sm text-zinc-600">학교명과 비밀번호로 로그인해 주세요.</p>
        </header>
        <LoginForm />
        <Link
          href="/apply"
          className="text-sm font-medium text-zinc-600 underline underline-offset-2 transition hover:text-zinc-900"
        >
          계정 신청하기
        </Link>
      </main>
    </div>
  );
}
