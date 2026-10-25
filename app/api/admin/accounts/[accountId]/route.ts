import { NextResponse } from "next/server";
import { deleteSchoolAccount, findAccountById, isAdminAccount } from "@/lib/accounts";
import { requireAdmin } from "@/lib/admin-auth";
import { deleteSurveysByOwner } from "@/lib/surveys";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ accountId: string }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const { accountId } = await context.params;
  const account = await findAccountById(accountId);
  if (!account || account.isDemo || isAdminAccount(account)) {
    return NextResponse.json({ error: "학교 계정을 찾을 수 없습니다." }, { status: 404 });
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

  const confirmUsername = (body as Record<string, unknown>).confirmUsername;
  if (typeof confirmUsername !== "string" || confirmUsername.trim() !== account.username) {
    return NextResponse.json(
      { error: "삭제를 확인하려면 아이디를 정확히 입력해 주세요." },
      { status: 400 },
    );
  }

  try {
    const surveyCount = await deleteSurveysByOwner(accountId);
    await deleteSchoolAccount(accountId);
    return NextResponse.json({
      ok: true,
      username: account.username,
      surveyCount,
    });
  } catch (error) {
    console.error("admin account delete failed:", error);
    return NextResponse.json({ error: "계정을 삭제하지 못했습니다." }, { status: 503 });
  }
}
