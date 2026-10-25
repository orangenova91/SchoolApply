import { NextResponse } from "next/server";
import { getSurveyByToken } from "@/lib/surveys";
import { getStudentSessionFromRequest } from "@/lib/student-session";

export async function findSurveyForStudents(token: string) {
  const survey = await getSurveyByToken(token);
  if (!survey || survey.status === "preparing" || !survey.published) {
    return { error: NextResponse.json({ error: "설문을 찾을 수 없거나 아직 시작되지 않았습니다." }, { status: 404 }) };
  }
  return { survey, published: survey.published };
}

export async function requireStudent(request: Request, token: string) {
  const access = await findSurveyForStudents(token);
  if (access.error) return access;
  const student = await getStudentSessionFromRequest(request, access.survey.id);
  if (!student) {
    return {
      error: NextResponse.json({ error: "로그인 시간이 지났습니다. 다시 로그인해 주세요." }, { status: 401 }),
    };
  }
  return { ...access, student };
}
