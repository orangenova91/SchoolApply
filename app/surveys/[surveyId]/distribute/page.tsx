import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { DistributionPanel } from "@/components/distribution-panel";
import { originFromHeaders, surveyUrl } from "@/lib/distribution-access";
import { listRespondents } from "@/lib/respondents";
import { countResponses } from "@/lib/responses";
import { getServerSession } from "@/lib/session";
import { isFormCompleted } from "@/lib/survey-form";
import { surveyTiming } from "@/lib/survey-types";
import { ensureDistributionToken, getStudentNoFormat, getSurvey, getSurveyFlow } from "@/lib/surveys";

export default async function SurveyDistributePage({
  params,
}: {
  params: Promise<{ surveyId: string }>;
}) {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const { surveyId } = await params;
  const survey = await getSurvey(session.accountId, surveyId);
  if (!survey) notFound();

  const { arrangement, form, published } = await getSurveyFlow(session.accountId, surveyId);
  if (!arrangement?.completedAt) redirect(`/surveys/${surveyId}`);
  if (!form || !isFormCompleted(form, arrangement.groups)) redirect(`/surveys/${surveyId}/form`);

  const token = await ensureDistributionToken(session.accountId, surveyId);
  if (!token) notFound();
  const url = surveyUrl(originFromHeaders(await headers()), token);
  const qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 192 });
  const respondents = await listRespondents(surveyId);
  const studentNoFormat = await getStudentNoFormat(session.accountId, surveyId);
  const responseCount = await countResponses(surveyId);

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-8">
      <main className="flex w-full max-w-6xl flex-col gap-6">
        <header className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">설문 배포</h1>
          <p className="mt-2 text-sm text-zinc-600">
            학생 명단을 올리고, 학생마다 발급된 접속 코드를 쪽지로 나눠 줍니다. 설문: {form.title}
          </p>
        </header>
        <DistributionPanel
          surveyId={survey.id}
          formTitle={form.title}
          surveyUrl={url}
          qrDataUrl={qrDataUrl}
          initialRespondents={respondents}
          initialFormat={studentNoFormat}
          status={survey.status}
          timing={surveyTiming(survey)}
          hasPublished={published !== null}
          responseCount={responseCount}
        />
      </main>
    </div>
  );
}
