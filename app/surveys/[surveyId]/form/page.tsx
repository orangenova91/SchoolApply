import { notFound, redirect } from "next/navigation";
import { EditLockNotice } from "@/components/edit-lock-notice";
import { trackRank } from "@/components/subject-shared";
import { SurveyFormEditor, type FormGroupInfo } from "@/components/survey-form-editor";
import { withoutMissingSubjects } from "@/lib/arrangement";
import { loadCurriculumCatalog } from "@/lib/curriculum";
import { getServerSession } from "@/lib/session";
import { catalogRows, type SubjectRow } from "@/lib/subject-rows";
import { defaultInstruction, reconcileForm } from "@/lib/survey-form";
import { getSurvey, getSurveyFlow } from "@/lib/surveys";

export default async function SurveyFormPage({
  params,
}: {
  params: Promise<{ surveyId: string }>;
}) {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const { surveyId } = await params;
  const survey = await getSurvey(session.accountId, surveyId);
  if (!survey) notFound();

  const flow = await getSurveyFlow(session.accountId, surveyId);
  if (!flow.arrangement?.completedAt) redirect(`/surveys/${surveyId}`);

  const catalog = catalogRows(await loadCurriculumCatalog());
  const { arrangement } = withoutMissingSubjects(flow.arrangement, catalog);
  const rowById = new Map<string, SubjectRow>([
    ...catalog.map((row) => [row.id, row] as const),
    ...arrangement.customSubjects.map((custom) => [custom.id, custom] as const),
  ]);

  const groups: FormGroupInfo[] = arrangement.groups.map((group) => ({
    groupId: group.id,
    groupName: group.name,
    pickCount: group.pickCount,
    defaultInstruction: defaultInstruction(group),
    subjects: group.subjectIds
      .flatMap((id) => {
        const row = rowById.get(id);
        return row ? [{ id: row.id, subject: row.subject, track: row.track }] : [];
      })
      .sort((left, right) => trackRank(left.track) - trackRank(right.track)),
  }));

  const { form, adjusted } = reconcileForm(flow.form, arrangement.groups, survey);
  const locked = survey.status !== "preparing";

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-8">
      <main className="flex w-full max-w-6xl flex-col gap-6">
        <header className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">설문지 양식</h1>
          <p className="mt-2 text-sm text-zinc-600">
            학생에게 배포할 설문지의 제목과 안내문을 작성하고, 선택과목 문항의 제목을 다듬습니다.
          </p>
        </header>
        {locked ? <EditLockNotice surveyId={survey.id} imported={survey.origin === "timetable_import"} /> : null}
        <fieldset disabled={locked} className="m-0 min-w-0 border-0 p-0">
          <SurveyFormEditor
            surveyId={survey.id}
            initialForm={form}
            initialSavedAt={flow.form?.updatedAt ?? null}
            adjustedCount={adjusted}
            groups={groups}
          />
        </fieldset>
      </main>
    </div>
  );
}
