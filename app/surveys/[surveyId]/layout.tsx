import { SurveyFlowStepper } from "@/components/survey-flow-stepper";
import { getServerSession } from "@/lib/session";
import { isFormCompleted } from "@/lib/survey-form";
import { getSurvey, getSurveyFlow } from "@/lib/surveys";
import { STATUS_LABEL } from "@/lib/survey-types";

export default async function SurveyFlowLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ surveyId: string }>;
}) {
  const { surveyId } = await params;
  const session = await getServerSession();
  const survey = session ? await getSurvey(session.accountId, surveyId) : null;
  if (!session || !survey) return children;

  const { arrangement, form, published } = await getSurveyFlow(session.accountId, surveyId);
  const formStep = !arrangement?.completedAt ? 0 : isFormCompleted(form, arrangement.groups) ? 2 : 1;
  const reachedStep = !published ? formStep : survey.status === "closed" || survey.status === "assigned" ? 4 : 3;
  const surveyLabel = [
    survey.school,
    `${survey.academicYear}학년도`,
    `${survey.grade}학년`,
    `${survey.semester}학기`,
  ].join(" · ");
  const surveyDetail = [STATUS_LABEL[survey.status], survey.note || null].filter(Boolean).join(" · ");

  return (
    <>
      <SurveyFlowStepper
        surveyId={survey.id}
        surveyLabel={surveyLabel}
        roundLabel={`${survey.round}차 조사`}
        surveyDetail={surveyDetail}
        reachedStep={reachedStep}
      />
      {children}
    </>
  );
}
