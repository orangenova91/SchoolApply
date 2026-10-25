import { NextResponse } from "next/server";
import { parseAnswers } from "@/lib/published-survey";
import { findRespondent } from "@/lib/respondents";
import { saveResponse } from "@/lib/responses";
import { requireStudent } from "@/lib/student-access";

type RouteContext = {
  params: Promise<{ token: string }>;
};

export async function PUT(request: Request, context: RouteContext) {
  const { token } = await context.params;
  const access = await requireStudent(request, token);
  if (access.error) return access.error;
  if (access.survey.status !== "open") {
    return NextResponse.json({ error: "마감된 설문이라 제출하거나 수정할 수 없습니다." }, { status: 409 });
  }
  if (!(await findRespondent(access.survey.id, access.student.studentNo))) {
    return NextResponse.json({ error: "명단에서 학번을 찾을 수 없습니다. 선생님께 문의해 주세요." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
  }
  const parsed = parseAnswers((body as { answers?: unknown } | null)?.answers, access.published);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const saved = await saveResponse(access.survey.id, access.student.studentNo, parsed.value, "student");
    if (!saved) {
      return NextResponse.json({ error: "잠시 후 다시 제출해 주세요." }, { status: 409 });
    }
    return NextResponse.json({ submittedAt: saved.submittedAt, updatedAt: saved.updatedAt });
  } catch (error) {
    console.error("response save failed:", error);
    return NextResponse.json({ error: "응답을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 503 });
  }
}
