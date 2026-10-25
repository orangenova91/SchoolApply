import { NextResponse } from "next/server";
import { parseAnswers } from "@/lib/published-survey";
import { findRespondent } from "@/lib/respondents";
import { saveResponse } from "@/lib/responses";
import { getSessionFromRequest } from "@/lib/session";
import { getSurvey, getSurveyFlow } from "@/lib/surveys";

type RouteContext = {
  params: Promise<{ surveyId: string; studentNo: string }>;
};

/** 교사가 학생 응답을 고치거나, 미제출 학생 대신 입력한다. 신청 중·마감 상태에서만 쓸 수 있다. */
export async function PUT(request: Request, context: RouteContext) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
  }
  const { answers, expectedRevision } = (body ?? {}) as { answers?: unknown; expectedRevision?: unknown };
  if (expectedRevision !== null && !(Number.isInteger(expectedRevision) && (expectedRevision as number) > 0)) {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const { surveyId, studentNo } = await context.params;
  try {
    const survey = await getSurvey(session.accountId, surveyId);
    if (!survey) {
      return NextResponse.json({ error: "조사를 찾을 수 없습니다." }, { status: 404 });
    }
    if (survey.status === "assigned") {
      return NextResponse.json({ error: "반 배정이 끝난 조사라 응답을 수정할 수 없습니다." }, { status: 409 });
    }
    const { published } = await getSurveyFlow(session.accountId, surveyId);
    if (survey.status === "preparing" || !published) {
      return NextResponse.json({ error: "배포를 시작한 조사만 응답을 수정할 수 있습니다." }, { status: 409 });
    }
    if (!(await findRespondent(surveyId, studentNo))) {
      return NextResponse.json({ error: "명단에서 학번을 찾을 수 없습니다." }, { status: 404 });
    }

    const parsed = parseAnswers(answers, published);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const saved = await saveResponse(surveyId, studentNo, parsed.value, "teacher", expectedRevision as number | null);
    if (!saved) {
      return NextResponse.json(
        { error: "그사이 학생이 응답을 바꿔 저장하지 않았습니다. 최신 응답을 확인한 뒤 다시 수정해 주세요." },
        { status: 409 },
      );
    }
    return NextResponse.json({ revision: saved.revision, updatedAt: saved.updatedAt });
  } catch (error) {
    console.error("teacher response save failed:", error);
    return NextResponse.json({ error: "응답을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 503 });
  }
}
