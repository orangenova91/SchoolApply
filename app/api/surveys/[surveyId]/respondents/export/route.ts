import { NextResponse } from "next/server";
import { csvResponse } from "@/lib/csv";
import { findDistributableSurvey, originFromHeaders, surveyUrl } from "@/lib/distribution-access";
import { listRespondents } from "@/lib/respondents";
import { classKey } from "@/lib/roster";
import { getSessionFromRequest } from "@/lib/session";
import { ensureDistributionToken } from "@/lib/surveys";

type RouteContext = {
  params: Promise<{ surveyId: string }>;
};

/** 학번·이름·접속 코드·설문 주소를 엑셀에서 바로 열리는 CSV(UTF-8 BOM)로 내려준다. */
export async function GET(request: Request, context: RouteContext) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { surveyId } = await context.params;
  const classFilter = new URL(request.url).searchParams.get("class");
  const access = await findDistributableSurvey(session, surveyId);
  if (access.error) return access.error;

  const token = await ensureDistributionToken(session.accountId, surveyId);
  const url = token ? surveyUrl(originFromHeaders(request.headers), token) : "";
  const respondents = (await listRespondents(surveyId)).filter(
    (respondent) => !classFilter || classKey(respondent.studentNo) === classFilter,
  );
  return csvResponse(`접속코드_${access.survey.round}차${classFilter ? `_${classFilter}` : ""}.csv`, [
    ["학번", "이름", "접속 코드", "설문 주소"],
    ...respondents.map((respondent) => [respondent.studentNo, respondent.name, respondent.code, url]),
  ]);
}
