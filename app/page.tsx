import { redirect } from "next/navigation";
import { SurveyHome } from "@/components/survey-home";
import { getServerSession } from "@/lib/session";
import { listSurveys } from "@/lib/surveys";

export default async function HomePage() {
  const session = await getServerSession();
  if (!session) redirect("/login");
  if (session.role === "admin") redirect("/admin");

  const surveys = await listSurveys(session.accountId);

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-12">
      <main className="flex w-full max-w-5xl flex-col items-center gap-8">
        <header className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">조사 목록</h1>
          <p className="mt-2 text-sm text-zinc-600">
            새 조사를 만들거나, 기존 신청을 이어서 진행하세요.
          </p>
        </header>
        <SurveyHome initialSurveys={surveys} schoolName={session.username} />
      </main>
    </div>
  );
}
