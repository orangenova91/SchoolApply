import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { createSurvey, listSurveys } from "@/lib/surveys";
import { isSurveyRound, MAX_SURVEY_NOTE } from "@/lib/survey-types";

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const surveys = await listSurveys(session.accountId);
  return NextResponse.json({ surveys });
}

export async function POST(request: Request) {
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
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
  }

  const { academicYear, grade, semester, round, note } = body as Record<string, unknown>;
  const year = typeof academicYear === "number" ? academicYear : Number(academicYear);
  const gradeNo = typeof grade === "number" ? grade : Number(grade);
  const semesterNo = typeof semester === "number" ? semester : Number(semester);
  const roundNo = typeof round === "number" ? round : Number(round);
  const noteText = typeof note === "string" ? note.trim() : "";

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json(
      { error: "학년도는 2000~2100 사이의 정수여야 합니다." },
      { status: 400 },
    );
  }
  if (!Number.isInteger(gradeNo) || gradeNo < 1 || gradeNo > 3) {
    return NextResponse.json({ error: "학년은 1, 2, 3 중에서 선택해 주세요." }, { status: 400 });
  }
  if (semesterNo !== 1 && semesterNo !== 2) {
    return NextResponse.json({ error: "학기는 1학기 또는 2학기입니다." }, { status: 400 });
  }
  if (!isSurveyRound(roundNo)) {
    return NextResponse.json({ error: "차수는 1차부터 10차까지 선택할 수 있습니다." }, { status: 400 });
  }
  if (typeof note !== "undefined" && typeof note !== "string") {
    return NextResponse.json({ error: "비고는 글자로 입력해 주세요." }, { status: 400 });
  }
  if (noteText.length > MAX_SURVEY_NOTE) {
    return NextResponse.json(
      { error: `비고는 ${MAX_SURVEY_NOTE}자 이하여야 합니다.` },
      { status: 400 },
    );
  }

  const survey = await createSurvey({
    ownerId: session.accountId,
    school: session.username,
    academicYear: year,
    grade: gradeNo,
    semester: semesterNo,
    round: roundNo,
    note: noteText,
  });
  if (!survey) {
    return NextResponse.json(
      { error: "같은 학년도, 학년, 학기의 이 차수 조사가 이미 있습니다." },
      { status: 409 },
    );
  }
  return NextResponse.json({ survey }, { status: 201 });
}
