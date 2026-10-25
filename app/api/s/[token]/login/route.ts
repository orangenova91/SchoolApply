import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { decryptAccessCode, normalizeAccessCode } from "@/lib/respondent-codes";
import { clearLoginFailures, findRespondent, recordLoginFailure } from "@/lib/respondents";
import { cleanCell } from "@/lib/roster";
import { findSurveyForStudents } from "@/lib/student-access";
import { createStudentToken, studentCookieOptions } from "@/lib/student-session";

type RouteContext = {
  params: Promise<{ token: string }>;
};

const WRONG_CREDENTIALS = "학번 또는 접속 코드가 맞지 않습니다.";

function sameCode(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request, context: RouteContext) {
  // 학교 전체가 인터넷 주소 하나를 함께 쓰는 경우가 많아 넉넉하게 잡는다. 학번별 잠금이 따로 있다.
  if (!checkRateLimit("student-login", getClientIp(request), 120, 60_000)) {
    return NextResponse.json({ error: "잠시 후 다시 시도해 주세요." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
  }
  const record = (body ?? {}) as Record<string, unknown>;
  const studentNo = typeof record.studentNo === "string" ? cleanCell(record.studentNo).replace(/\s+/g, "") : "";
  const code = typeof record.code === "string" ? normalizeAccessCode(record.code) : "";
  if (!studentNo || !code) {
    return NextResponse.json({ error: "학번과 접속 코드를 입력해 주세요." }, { status: 400 });
  }

  const { token } = await context.params;
  const access = await findSurveyForStudents(token);
  if (access.error) return access.error;
  const surveyId = access.survey.id;

  const respondent = await findRespondent(surveyId, studentNo);
  if (!respondent) {
    return NextResponse.json({ error: WRONG_CREDENTIALS }, { status: 401 });
  }
  if (respondent.lockedUntil && new Date(respondent.lockedUntil) > new Date()) {
    const minutes = Math.ceil((new Date(respondent.lockedUntil).getTime() - Date.now()) / 60_000);
    return NextResponse.json(
      { error: `여러 번 틀려 잠시 막혔습니다. ${minutes}분 뒤에 다시 시도하거나 선생님께 문의해 주세요.` },
      { status: 429 },
    );
  }

  const expected = decryptAccessCode(respondent.codeCipher);
  if (!expected || !sameCode(expected, code)) {
    await recordLoginFailure(surveyId, studentNo);
    return NextResponse.json({ error: WRONG_CREDENTIALS }, { status: 401 });
  }

  await clearLoginFailures(surveyId, studentNo);
  const response = NextResponse.json({ name: respondent.name, studentNo });
  response.cookies.set({ ...studentCookieOptions, value: await createStudentToken({ surveyId, studentNo }) });
  return response;
}
