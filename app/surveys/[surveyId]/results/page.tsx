import { notFound, redirect } from "next/navigation";
import { ResultsView } from "@/components/results-view";
import { loadSurveyResults } from "@/lib/results";
import { getServerSession } from "@/lib/session";
import { surveyTiming } from "@/lib/survey-types";
import { getSurvey, getSurveyFlow } from "@/lib/surveys";

export default async function SurveyResultsPage({
  params,
}: {
  params: Promise<{ surveyId: string }>;
}) {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const { surveyId } = await params;
  const survey = await getSurvey(session.accountId, surveyId);
  if (!survey) notFound();

  const { published } = await getSurveyFlow(session.accountId, surveyId);
  if (!published) redirect(`/surveys/${surveyId}/distribute`);

  const results = await loadSurveyResults(surveyId, published);

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-8">
      <main className="flex w-full max-w-6xl flex-col gap-6">
        <header className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">응답 확인</h1>
          <p className="mt-2 text-sm text-zinc-600">
            학생들의 제출 현황과 과목별 신청 인원을 확인합니다. 설문: {published.title}
          </p>
        </header>
        <ResultsView
          surveyId={survey.id}
          status={survey.status}
          timing={surveyTiming(survey)}
          published={published}
          results={results}
          generatedAt={new Date().toISOString()}
          imported={survey.origin === "timetable_import"}
        />
      </main>
    </div>
  );
}
