import { NextResponse } from "next/server";
import { findDistributableSurvey } from "@/lib/distribution-access";
import { loadCurriculumCatalog } from "@/lib/curriculum";
import { buildPublishedSurvey } from "@/lib/published-survey";
import { existingStudentNos } from "@/lib/respondents";
import { getSessionFromRequest } from "@/lib/session";
import { catalogRows } from "@/lib/subject-rows";
import { changeSurveyStatus } from "@/lib/surveys";
import type { SurveyStatus } from "@/lib/survey-types";

type RouteContext = {
  params: Promise<{ surveyId: string }>;
};

const TRANSITIONS: Record<string, { from: SurveyStatus[]; to: SurveyStatus; failure: string }> = {
  open: { from: ["preparing"], to: "open", failure: "준비 중인 조사만 배포를 시작할 수 있습니다." },
  close: { from: ["open"], to: "closed", failure: "신청 중인 조사만 마감할 수 있습니다." },
  reopen: { from: ["closed"], to: "open", failure: "마감한 조사만 다시 열 수 있습니다." },
  revert: { from: ["open", "closed"], to: "preparing", failure: "배포 중이거나 마감한 조사만 준비 상태로 되돌릴 수 있습니다." },
};

export async function POST(request: Request, context: RouteContext) {
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
  const action = (body as { action?: unknown } | null)?.action;
  const transition = typeof action === "string" ? TRANSITIONS[action] : undefined;
  if (!transition) {
    return NextResponse.json({ error: "알 수 없는 요청입니다." }, { status: 400 });
  }

  const { surveyId } = await context.params;
  try {
    const access = await findDistributableSurvey(session, surveyId);
    if (access.error) return access.error;

    let published;
    if (action === "open") {
      if ((await existingStudentNos(surveyId)).length === 0) {
        return NextResponse.json({ error: "학생 명단을 먼저 올려 주세요." }, { status: 409 });
      }
      published = buildPublishedSurvey(access.arrangement, access.form, catalogRows(await loadCurriculumCatalog()));
    }

    const changed = await changeSurveyStatus(
      session.accountId,
      surveyId,
      transition.from,
      transition.to,
      published,
    );
    if (!changed) {
      return NextResponse.json({ error: transition.failure }, { status: 409 });
    }
    return NextResponse.json({ status: transition.to });
  } catch (error) {
    console.error("survey status change failed:", error);
    return NextResponse.json({ error: "배포 상태를 바꾸지 못했습니다." }, { status: 503 });
  }
}
