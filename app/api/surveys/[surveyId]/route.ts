import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { deleteSurvey } from "@/lib/surveys";

type RouteContext = {
  params: Promise<{ surveyId: string }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { surveyId } = await context.params;
  try {
    const deleted = await deleteSurvey(session.accountId, surveyId);
    if (!deleted) {
      return NextResponse.json({ error: "조사를 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("survey delete failed:", error);
    return NextResponse.json({ error: "조사를 삭제하지 못했습니다." }, { status: 503 });
  }
}
