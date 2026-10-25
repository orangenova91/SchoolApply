import { NextResponse } from "next/server";
import type { SessionPayload } from "@/lib/session";
import { isFormCompleted } from "@/lib/survey-form";
import { getSurvey, getSurveyFlow } from "@/lib/surveys";

/** 설문 배포 단계는 편성과 설문지 양식을 모두 완료한 조사에서만 쓸 수 있다. */
export async function findDistributableSurvey(session: SessionPayload, surveyId: string) {
  const survey = await getSurvey(session.accountId, surveyId);
  if (!survey) {
    return { error: NextResponse.json({ error: "조사를 찾을 수 없습니다." }, { status: 404 }) };
  }
  const { arrangement, form } = await getSurveyFlow(session.accountId, surveyId);
  if (!arrangement?.completedAt || !form || !isFormCompleted(form, arrangement.groups)) {
    return {
      error: NextResponse.json({ error: "선택과목 편성과 설문지 양식을 먼저 완료해 주세요." }, { status: 409 }),
    };
  }
  return { survey, arrangement, form };
}

export function originFromHeaders(headers: Headers) {
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? "localhost:3000";
  const forwardedProto = headers.get("x-forwarded-proto");
  const proto = forwardedProto ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

export function surveyUrl(origin: string, token: string) {
  return `${origin}/s/${token}`;
}
