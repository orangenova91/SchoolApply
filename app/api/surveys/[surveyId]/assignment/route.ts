import { NextResponse } from "next/server";
import { checkAssignment, parseSettings, type SurveyAssignment } from "@/lib/assignment";
import { loadAssignmentContext } from "@/lib/assignment-data";
import { solveAssignment } from "@/lib/assignment-solver";
import { getSessionFromRequest } from "@/lib/session";
import { saveSurveyAssignment, setAssignmentConfirmed } from "@/lib/surveys";

export const maxDuration = 120;

type RouteContext = {
  params: Promise<{ surveyId: string }>;
};

const CLOSED_ONLY = "설문을 마감한 뒤에 반을 편성할 수 있습니다.";
const SAVE_FAILED = "반 편성을 저장하지 못했습니다.";

/**
 * action: solve(설정으로 자동 배정) | save(학생 이동 저장) | confirm(확정) | unconfirm(확정 취소)
 */
export async function POST(request: Request, context: RouteContext) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
  }

  const { surveyId } = await context.params;
  try {
    const data = await loadAssignmentContext(session.accountId, surveyId);
    if (!data) return NextResponse.json({ error: "조사를 찾을 수 없습니다." }, { status: 404 });
    if (!data.published) {
      return NextResponse.json({ error: "배포를 시작한 조사만 반을 편성할 수 있습니다." }, { status: 409 });
    }
    const { survey, published, students, assignment } = data;

    if (body.action === "unconfirm") {
      if (!(await setAssignmentConfirmed(session.accountId, surveyId, false))) {
        return NextResponse.json({ error: "배정 완료 상태가 아닙니다." }, { status: 409 });
      }
      return NextResponse.json({ status: "closed" });
    }

    if (survey.status === "assigned") {
      return NextResponse.json({ error: "확정한 반 편성입니다. 확정을 취소한 뒤에 고쳐 주세요." }, { status: 409 });
    }
    if (survey.status !== "closed") return NextResponse.json({ error: CLOSED_ONLY }, { status: 409 });

    if (body.action === "solve") {
      if (students.length === 0) {
        return NextResponse.json({ error: "제출한 응답이 없어 반을 편성할 수 없습니다." }, { status: 409 });
      }
      const parsed = parseSettings(body.settings, published, students);
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
      let solved;
      try {
        solved = await solveAssignment(published, students, parsed.value);
      } catch (error) {
        const message = error instanceof Error ? error.message : "배정 계산에 실패했습니다.";
        return NextResponse.json({ error: message }, { status: 422 });
      }
      const now = new Date().toISOString();
      const next: SurveyAssignment = {
        settings: parsed.value,
        sections: solved.sections,
        unplaced: solved.unplaced,
        solvedAt: now,
        timeLimited: solved.timeLimited,
        updatedAt: now,
      };
      if (!(await saveSurveyAssignment(session.accountId, surveyId, next))) {
        return NextResponse.json({ error: CLOSED_ONLY }, { status: 409 });
      }
      return NextResponse.json({ assignment: next });
    }

    if (body.action === "save") {
      if (!assignment) return NextResponse.json({ error: "먼저 자동 배정을 실행해 주세요." }, { status: 409 });
      if (!Array.isArray(body.sections)) {
        return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
      }
      const incoming = new Map<string, string[]>();
      for (const item of body.sections) {
        const record = (item ?? {}) as Record<string, unknown>;
        if (typeof record.id !== "string" || !Array.isArray(record.studentNos)) {
          return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
        }
        incoming.set(
          record.id,
          record.studentNos.filter((studentNo): studentNo is string => typeof studentNo === "string"),
        );
      }
      if (
        incoming.size !== assignment.sections.length ||
        assignment.sections.some((section) => !incoming.has(section.id))
      ) {
        return NextResponse.json(
          { error: "그사이 반 편성이 바뀌었습니다. 새로고침한 뒤 다시 옮겨 주세요." },
          { status: 409 },
        );
      }
      const sections = assignment.sections.map((section) => ({
        ...section,
        studentNos: [...new Set(incoming.get(section.id)!)].sort(),
      }));
      const { problems, unplaced } = checkAssignment(published, students, assignment.settings, sections);
      if (problems.length > 0) return NextResponse.json({ error: problems[0] }, { status: 400 });
      const next: SurveyAssignment = { ...assignment, sections, unplaced, updatedAt: new Date().toISOString() };
      if (!(await saveSurveyAssignment(session.accountId, surveyId, next))) {
        return NextResponse.json({ error: CLOSED_ONLY }, { status: 409 });
      }
      return NextResponse.json({ assignment: next });
    }

    if (body.action === "confirm") {
      if (!assignment) return NextResponse.json({ error: "먼저 자동 배정을 실행해 주세요." }, { status: 409 });
      const { problems } = checkAssignment(published, students, assignment.settings, assignment.sections);
      if (problems.length > 0) {
        return NextResponse.json(
          { error: `응답이 바뀌어 지금 배정과 맞지 않습니다. 자동 배정을 다시 실행해 주세요. (${problems[0]})` },
          { status: 409 },
        );
      }
      if (!(await setAssignmentConfirmed(session.accountId, surveyId, true))) {
        return NextResponse.json({ error: CLOSED_ONLY }, { status: 409 });
      }
      return NextResponse.json({ status: "assigned" });
    }

    return NextResponse.json({ error: "알 수 없는 요청입니다." }, { status: 400 });
  } catch (error) {
    console.error("assignment request failed:", error);
    return NextResponse.json({ error: SAVE_FAILED }, { status: 503 });
  }
}
