import { notFound, redirect } from "next/navigation";
import { AssignmentPanel } from "@/components/assignment-panel";
import { defaultSettings } from "@/lib/assignment";
import { loadAssignmentContext } from "@/lib/assignment-data";
import { getServerSession } from "@/lib/session";

export default async function SurveyAssignPage({
  params,
}: {
  params: Promise<{ surveyId: string }>;
}) {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const { surveyId } = await params;
  const data = await loadAssignmentContext(session.accountId, surveyId);
  if (!data) notFound();
  if (!data.published) redirect(`/surveys/${surveyId}/distribute`);
  const { survey, published, results, students, assignment } = data;

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-8">
      <main className="flex w-full max-w-6xl flex-col gap-6">
        <header className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">반 편성</h1>
          <p className="mt-2 text-sm text-zinc-600">
            선택과목마다 반 수를 정하고, 시간이 겹치지 않도록 블록과 학생을 자동으로 배정합니다. 기존 학급은 그대로 둡니다.
          </p>
        </header>
        <AssignmentPanel
          surveyId={survey.id}
          status={survey.status}
          published={published}
          students={students}
          excludedCount={results.total - results.submitted}
          initialAssignment={assignment}
          defaultSettings={defaultSettings(published, students)}
        />
      </main>
    </div>
  );
}
