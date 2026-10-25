import { NextRequest, NextResponse } from "next/server";
import { countSchoolAccounts, listSchoolAccounts } from "@/lib/accounts";
import { requireAdmin } from "@/lib/admin-auth";
import { countSurveysByOwners } from "@/lib/surveys";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const q = request.nextUrl.searchParams.get("q") ?? "";
    const [items, total] = await Promise.all([listSchoolAccounts(q), countSchoolAccounts()]);
    const surveyCounts = await countSurveysByOwners(items.map((account) => account._id.toString()));
    const mapped = items
      .map((account) => {
        const createdAt =
          account.createdAt instanceof Date
            ? account.createdAt
            : account.createdAt
              ? new Date(account.createdAt)
              : account._id.getTimestamp();
        return {
          id: account._id.toString(),
          username: account.username,
          createdAt: createdAt.toISOString(),
          surveyCount: surveyCounts.get(account._id.toString()) ?? 0,
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return NextResponse.json({ items: mapped, total });
  } catch (error) {
    console.error("admin accounts GET failed:", error);
    return NextResponse.json({ error: "계정 목록을 불러오지 못했습니다." }, { status: 503 });
  }
}
