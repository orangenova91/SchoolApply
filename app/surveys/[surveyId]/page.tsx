import { notFound, redirect } from "next/navigation";
import { EditLockNotice } from "@/components/edit-lock-notice";
import { SubjectArrangement } from "@/components/subject-arrangement";
import { withoutMissingSubjects } from "@/lib/arrangement";
import { loadCurriculumCatalog } from "@/lib/curriculum";
import { getServerSession } from "@/lib/session";
import { catalogRows } from "@/lib/subject-rows";
import { getSurvey, getSurveyArrangement } from "@/lib/surveys";

export default async function SurveyPage({
  params,
}: {
  params: Promise<{ surveyId: string }>;
}) {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const { surveyId } = await params;
  const survey = await getSurvey(session.accountId, surveyId);
  if (!survey) notFound();

  const catalog = await loadCurriculumCatalog();
  const saved = await getSurveyArrangement(session.accountId, surveyId);
  const { arrangement, removed } = saved
    ? withoutMissingSubjects(saved, catalogRows(catalog))
    : { arrangement: null, removed: 0 };
  const locked = survey.status !== "preparing";

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-8">
      <main className="flex w-full max-w-6xl flex-col gap-6">
        <header className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">선택과목 편성</h1>
          <p className="mt-2 text-sm text-zinc-600">
            과목을 체크해 그룹으로 끌어다 놓거나, 그룹의 + 과목 추가로 검색해 넣으세요. 그룹마다
            학생이 고를 과목 수(선택수)를 정합니다.
          </p>
        </header>
        {locked ? <EditLockNotice surveyId={survey.id} imported={survey.origin === "timetable_import"} /> : null}
        <fieldset disabled={locked} className="m-0 min-w-0 border-0 p-0">
          <SubjectArrangement
            catalog={catalog}
            surveyId={survey.id}
            initialArrangement={arrangement}
            removedSubjectCount={removed}
          />
        </fieldset>
      </main>
    </div>
  );
}
