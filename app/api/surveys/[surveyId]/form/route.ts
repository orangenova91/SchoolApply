import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { parseFormInput, type SurveyForm } from "@/lib/survey-form";
import { getSurvey, getSurveyFlow, saveSurveyForm } from "@/lib/surveys";
import { EDIT_LOCKED_MESSAGE } from "@/lib/survey-types";

type RouteContext = {
  params: Promise<{ surveyId: string }>;
};

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
  const { form, complete } = (body ?? {}) as Record<string, unknown>;

  const { surveyId } = await context.params;
  try {
    const survey = await getSurvey(session.accountId, surveyId);
    if (!survey) {
      return NextResponse.json({ error: "조사를 찾을 수 없습니다." }, { status: 404 });
    }
    if (survey.status !== "preparing") {
      return NextResponse.json({ error: EDIT_LOCKED_MESSAGE }, { status: 409 });
    }
    const flow = await getSurveyFlow(session.accountId, surveyId);
    if (!flow.arrangement?.completedAt) {
      return NextResponse.json({ error: "선택과목 편성을 먼저 완료해 주세요." }, { status: 409 });
    }

    const groups = flow.arrangement.groups;
    const parsed = parseFormInput(form, groups, complete === true);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const now = new Date().toISOString();
    const stillComplete = parseFormInput(parsed.value, groups, true).ok;
    const completedAt = complete === true ? now : stillComplete ? flow.form?.completedAt : undefined;
    const saved: SurveyForm = { ...parsed.value, updatedAt: now, ...(completedAt ? { completedAt } : {}) };

    await saveSurveyForm(session.accountId, surveyId, saved);
    return NextResponse.json({ form: saved });
  } catch (error) {
    console.error("survey form save failed:", error);
    return NextResponse.json({ error: "설문지 양식을 저장하지 못했습니다." }, { status: 503 });
  }
}
