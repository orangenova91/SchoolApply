import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "개인정보처리방침 · 스쿨어플라이(SchoolApply)",
};

export default function PrivacyPage() {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-12">
      <main className="flex w-full max-w-3xl flex-col gap-8">
        <header className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">개인정보처리방침</h1>
          <p className="mt-2 text-sm text-zinc-600">시행일자: 2026년 10월 25일</p>
        </header>
        <div className="flex flex-col gap-8 rounded-2xl border border-zinc-200 bg-white p-6 text-sm leading-relaxed text-zinc-700 shadow-sm sm:p-8">
          <p>
            스쿨어플라이(SchoolApply, 이하 “서비스”)는 계정 발급과 선택과목 신청·반 배정을 위해
            필요한 범위에서 개인정보를 처리합니다.
          </p>
          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-zinc-900">1. 수집 항목</h2>
            <ul className="list-inside list-disc space-y-1">
              <li>계정 정보: 아이디(학교명), 비밀번호(암호화 저장)</li>
              <li>계정 신청 정보: 학교명·지역·학교급, 담당 교사 성명·휴대전화·이메일, 직위, 문의 내용</li>
              <li>서비스 이용 정보: 조사, 학생 명단, 선택과목 신청, 반 배정 결과</li>
              <li>로그인 유지를 위한 세션 쿠키</li>
            </ul>
          </section>
          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-zinc-900">2. 이용 목적</h2>
            <ul className="list-inside list-disc space-y-1">
              <li>계정 신청 접수와 발급 안내</li>
              <li>학교별 로그인과 조사 관리</li>
              <li>문의 응대</li>
            </ul>
          </section>
          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-zinc-900">3. 보유 기간</h2>
            <p>
              계정 신청 정보는 발급 또는 반려 후 1년간 보관합니다. 계정과 조사 자료는 이용자가
              삭제를 요청하기 전까지 보관합니다. 세션 쿠키는 최대 30일이며 로그아웃하면 삭제됩니다.
            </p>
          </section>
        </div>
        <Link
          href="/apply"
          className="text-center text-sm font-medium text-zinc-600 underline underline-offset-2"
        >
          계정 신청으로
        </Link>
      </main>
    </div>
  );
}
