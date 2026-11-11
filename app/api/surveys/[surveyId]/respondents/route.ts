import { NextResponse } from "next/server";
import { findDistributableSurvey } from "@/lib/distribution-access";
import { deleteRespondentsBySurvey, existingStudentNos, listRespondents, replaceRoster } from "@/lib/respondents";
import { countResponses, deleteResponses, respondedStudentNos } from "@/lib/responses";
import { isStudentNoFormat, parseRosterInput } from "@/lib/roster";
import { getSessionFromRequest } from "@/lib/session";
import { ensureDistributionToken, setStudentNoFormat } from "@/lib/surveys";

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
  const { students, format, confirmRemoval } = (body ?? {}) as {
    students?: unknown;
    format?: unknown;
    confirmRemoval?: unknown;
  };
  if (!isStudentNoFormat(format)) {
    return NextResponse.json({ error: "학번 형식을 선택해 주세요." }, { status: 400 });
  }
  const parsed = parseRosterInput(students, format);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { surveyId } = await context.params;
  try {
    const access = await findDistributableSurvey(session, surveyId);
    if (access.error) return access.error;

    const incoming = new Set(parsed.value.map((student) => student.studentNo));
    const leaving = (await existingStudentNos(surveyId)).filter((studentNo) => !incoming.has(studentNo));
    const respondedLeaving = leaving.length > 0 ? await respondedStudentNos(surveyId, leaving) : [];
    if (respondedLeaving.length > 0 && confirmRemoval !== true) {
      return NextResponse.json(
        {
          error: `응답을 제출한 학생 ${respondedLeaving.length}명이 명단에서 빠집니다. 이 학생들의 응답도 함께 삭제됩니다.`,
          needsConfirm: true,
          respondedLeaving,
        },
        { status: 409 },
      );
    }

    await ensureDistributionToken(session.accountId, surveyId);
    await setStudentNoFormat(session.accountId, surveyId, format);
    const summary = await replaceRoster(surveyId, parsed.value);
    if (summary.removedStudentNos.length > 0) await deleteResponses(surveyId, summary.removedStudentNos);
    return NextResponse.json({ summary, format, respondents: await listRespondents(surveyId) });
  } catch (error) {
    console.error("roster save failed:", error);
    return NextResponse.json({ error: "명단을 저장하지 못했습니다." }, { status: 503 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const confirmRemoval = new URL(request.url).searchParams.get("confirm") === "1";
  const { surveyId } = await context.params;
  try {
    const access = await findDistributableSurvey(session, surveyId);
    if (access.error) return access.error;
    if (access.survey.status === "open") {
      return NextResponse.json(
        { error: "신청 중에는 명단을 삭제할 수 없습니다. 먼저 마감하거나 준비 상태로 되돌려 주세요." },
        { status: 409 },
      );
    }
    if (access.survey.status === "assigned") {
      return NextResponse.json({ error: "배정이 끝난 조사는 명단을 삭제할 수 없습니다." }, { status: 409 });
    }

    const responseCount = await countResponses(surveyId);
    if (responseCount > 0 && !confirmRemoval) {
      return NextResponse.json(
        { error: `제출된 응답 ${responseCount}건도 함께 삭제됩니다.`, needsConfirm: true },
        { status: 409 },
      );
    }

    const removed = (await existingStudentNos(surveyId)).length;
    await deleteRespondentsBySurvey(surveyId);
    await deleteResponses(surveyId);
    return NextResponse.json({ removed, deletedResponses: responseCount });
  } catch (error) {
    console.error("roster delete failed:", error);
    return NextResponse.json({ error: "명단을 삭제하지 못했습니다." }, { status: 503 });
  }
}
