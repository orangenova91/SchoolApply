import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AccountHeader } from "@/components/account-header";
import { SiteFooter } from "@/components/site-footer";
import { getServerSession } from "@/lib/session";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "스쿨어플라이(SchoolApply)",
  description: "선택과목 신청과 반 배정",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();

  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {session ? (
          <AccountHeader username={session.username} isAdmin={session.role === "admin"} />
        ) : null}
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
