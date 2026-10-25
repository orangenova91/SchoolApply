import { NextResponse } from "next/server";
import { completionIssues, parseArrangementInput, type SurveyArrangement } from "@/lib/arrangement";
import { loadCurriculumCatalog } from "@/lib/curriculum";
import { getSessionFromRequest } from "@/lib/session";
import { catalogRows } from "@/lib/subject-rows";
import { getSurvey, getSurveyArrangement, saveSurveyArrangement } from "@/lib/surveys";
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
  const { arrangement, complete } = (body ?? {}) as Record<string, unknown>;

  const { surveyId } = await context.params;
  try {
    const survey = await getSurvey(session.accountId, surveyId);
    if (!survey) {
      return NextResponse.json({ error: "조사를 찾을 수 없습니다." }, { status: 404 });
    }
    if (survey.status !== "preparing") {
      return NextResponse.json({ error: EDIT_LOCKED_MESSAGE }, { status: 409 });
    }

    const catalog = catalogRows(await loadCurriculumCatalog());
    const parsed = parseArrangementInput(arrangement, catalog);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const issues = completionIssues(parsed.value);
    if (complete === true && issues.length > 0) {
      return NextResponse.json({ error: "넘어가기 전에 확인할 내용이 있습니다.", issues }, { status: 400 });
    }

    const now = new Date().toISOString();
    const previous = await getSurveyArrangement(session.accountId, surveyId);
    const completedAt =
      complete === true ? now : issues.length === 0 ? previous?.completedAt : undefined;
    const saved: SurveyArrangement = { ...parsed.value, updatedAt: now, ...(completedAt ? { completedAt } : {}) };

    await saveSurveyArrangement(session.accountId, surveyId, saved);
    return NextResponse.json({ arrangement: saved });
  } catch (error) {
    console.error("arrangement save failed:", error);
    return NextResponse.json({ error: "편성을 저장하지 못했습니다." }, { status: 503 });
  }
}
