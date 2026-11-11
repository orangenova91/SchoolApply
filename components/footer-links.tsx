"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { KAKAO_INQUIRY_URL } from "@/lib/contact";

const LINK_CLASS = "transition hover:text-zinc-900 hover:underline hover:underline-offset-2";

/** 학생 설문 화면(/s/…)의 문의는 담당 선생님이 받으므로 운영자 문의 링크를 뺀다. */
export function FooterLinks() {
  const pathname = usePathname();
  const studentPage = pathname.startsWith("/s/");

  return (
    <div className="flex items-center gap-4">
      <Link href="/privacy" className={LINK_CLASS}>
        개인정보처리방침
      </Link>
      {studentPage ? null : (
        <a href={KAKAO_INQUIRY_URL} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
          문의하기
        </a>
      )}
    </div>
  );
}
