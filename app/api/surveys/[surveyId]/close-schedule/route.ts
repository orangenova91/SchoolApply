import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getSurvey, setCloseSchedule } from "@/lib/surveys";

type RouteContext = {
  params: Promise<{ surveyId: string }>;
};

const MAX_AHEAD_MS = 366 * 24 * 60 * 60 * 1000;

/** 예약 마감 시각을 정하거나 지운다. body: { closesAt: ISO 시각 | null } */
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
  const raw = (body as { closesAt?: unknown } | null)?.closesAt;
  let closesAt: string | null = null;
  if (raw !== null) {
    const time = typeof raw === "string" ? Date.parse(raw) : NaN;
    if (Number.isNaN(time)) {
      return NextResponse.json({ error: "마감 시각을 확인해 주세요." }, { status: 400 });
    }
    if (time <= Date.now() + 60 * 1000) {
      return NextResponse.json({ error: "마감 시각은 지금보다 뒤로 정해 주세요." }, { status: 400 });
    }
    if (time > Date.now() + MAX_AHEAD_MS) {
      return NextResponse.json({ error: "마감 시각은 1년 안으로 정해 주세요." }, { status: 400 });
    }
    closesAt = new Date(time).toISOString();
  }

  const { surveyId } = await context.params;
  try {
    const survey = await getSurvey(session.accountId, surveyId);
    if (!survey) {
      return NextResponse.json({ error: "조사를 찾을 수 없습니다." }, { status: 404 });
    }
    if (!(await setCloseSchedule(session.accountId, surveyId, closesAt))) {
      return NextResponse.json({ error: "준비 중이거나 신청 중인 조사만 예약 마감을 정할 수 있습니다." }, { status: 409 });
    }
    return NextResponse.json({ closesAt });
  } catch (error) {
    console.error("close schedule failed:", error);
    return NextResponse.json({ error: "예약 마감을 저장하지 못했습니다." }, { status: 503 });
  }
}
