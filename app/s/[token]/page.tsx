import type { Metadata } from "next";
import { StudentLogin } from "@/components/student-login";
import { StudentSurvey } from "@/components/student-survey";
import { answersMatch } from "@/lib/published-survey";
import { findRespondent } from "@/lib/respondents";
import { getResponse } from "@/lib/responses";
import { studentLabel } from "@/lib/roster";
import { getServerStudentSession } from "@/lib/student-session";
import { formatSeoulTime } from "@/lib/survey-types";
import { getSurveyByToken } from "@/lib/surveys";

type PageProps = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const survey = await getSurveyByToken(token);
  return { title: survey?.published?.title ?? "선택과목 설문" };
}

function Notice({ title, message }: { title: string; message: string }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white px-6 py-10 text-center shadow-sm">
      <h1 className="text-lg font-semibold text-zinc-900">{title}</h1>
      <p className="mt-2 text-sm text-zinc-600">{message}</p>
    </section>
  );
}

export default async function StudentSurveyPage({ params }: PageProps) {
  const { token } = await params;
  const survey = await getSurveyByToken(token);

  let content: React.ReactNode;
  if (!survey) {
    content = <Notice title="설문을 찾을 수 없습니다" message="주소를 다시 확인해 주세요." />;
  } else if (survey.status === "preparing" || !survey.published) {
    content = <Notice title="아직 시작되지 않은 설문입니다" message="선생님이 설문을 시작한 뒤에 다시 접속해 주세요." />;
  } else {
    const open = survey.status === "open";
    const session = await getServerStudentSession(survey.id);
    const respondent = session ? await findRespondent(survey.id, session.studentNo) : null;
    if (!respondent) {
      content = <StudentLogin token={token} closed={!open} />;
    } else {
      const response = await getResponse(survey.id, respondent.studentNo);
      const valid = response ? answersMatch(response.answers, survey.published) : false;
      const allowed = new Map(
        survey.published.questions.map((question) => [question.groupId, new Set(question.subjects.map((s) => s.id))]),
      );
      const initialPicked = Object.fromEntries(
        (response?.answers ?? []).map((answer) => [
          answer.groupId,
          answer.subjectIds.filter((id) => allowed.get(answer.groupId)?.has(id)),
        ]),
      );
      content = (
        <StudentSurvey
          token={token}
          published={survey.published}
          studentLabel={studentLabel(respondent.studentNo, respondent.name)}
          initialPicked={initialPicked}
          initialSubmittedAt={response?.submittedAt ?? null}
          initialUpdatedAt={response?.updatedAt ?? null}
          answersValid={valid}
          open={open}
        />
      );
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-8">
      <main className="flex w-full max-w-md flex-col gap-4">
        {survey ? (
          <header className="text-center">
            <p className="text-sm text-zinc-500">
              {survey.school}
              <span className="ml-2 rounded bg-violet-50 px-1.5 py-0.5 text-xs font-semibold text-violet-700 ring-1 ring-violet-100">
                {survey.round}차 조사
              </span>
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              {survey.status === "open" ? (
                survey.closesAt ? (
                  <>
                    신청 중 ·{" "}
                    <span className="font-medium text-violet-700">{formatSeoulTime(survey.closesAt)}까지</span>
                  </>
                ) : (
                  "신청 중"
                )
              ) : survey.status === "preparing" ? (
                "준비 중"
              ) : (
                "마감"
              )}
            </p>
          </header>
        ) : null}
        {content}
      </main>
    </div>
  );
}
