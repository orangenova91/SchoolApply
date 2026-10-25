import { NextResponse } from "next/server";
import { findDistributableSurvey } from "@/lib/distribution-access";
import { listRespondents, reissueCodes } from "@/lib/respondents";
import { parseStudentNo } from "@/lib/roster";
import { getSessionFromRequest } from "@/lib/session";

type RouteContext = {
  params: Promise<{ surveyId: string }>;
};

/** 학생 접속 코드를 다시 발급한다. 이전 코드는 바로 쓸 수 없게 된다. */
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
  const studentNos = (body as { studentNos?: unknown } | null)?.studentNos;
  if (
    !Array.isArray(studentNos) ||
    studentNos.length === 0 ||
    !studentNos.every((studentNo) => typeof studentNo === "string" && parseStudentNo(studentNo))
  ) {
    return NextResponse.json({ error: "재발급할 학생을 선택해 주세요." }, { status: 400 });
  }

  const { surveyId } = await context.params;
  try {
    const access = await findDistributableSurvey(session, surveyId);
    if (access.error) return access.error;

    const reissued = await reissueCodes(surveyId, studentNos as string[]);
    return NextResponse.json({ reissued, respondents: await listRespondents(surveyId) });
  } catch (error) {
    console.error("code reissue failed:", error);
    return NextResponse.json({ error: "코드를 다시 발급하지 못했습니다." }, { status: 503 });
  }
}
