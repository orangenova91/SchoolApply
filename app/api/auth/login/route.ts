import { NextResponse } from "next/server";
import { findAccountByUsername, verifyPassword } from "@/lib/accounts";
import { createSessionToken, sessionCookieOptions } from "@/lib/session";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
  }

  const { username, password } = body as Record<string, unknown>;
  if (
    typeof username !== "string" ||
    username.trim().length === 0 ||
    typeof password !== "string" ||
    password.length === 0
  ) {
    return NextResponse.json(
      { error: "아이디와 비밀번호를 입력해 주세요." },
      { status: 400 },
    );
  }

  try {
    const account = await findAccountByUsername(username);
    if (!account || account.isDemo) {
      return NextResponse.json(
        { error: "아이디 또는 비밀번호가 올바르지 않습니다." },
        { status: 401 },
      );
    }

    const valid = await verifyPassword(password, account.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: "아이디 또는 비밀번호가 올바르지 않습니다." },
        { status: 401 },
      );
    }

    const role = account.role === "admin" ? ("admin" as const) : undefined;
    const token = await createSessionToken({
      accountId: account._id.toString(),
      username: account.username,
      ...(role ? { role } : {}),
    });
    const response = NextResponse.json({
      username: account.username,
      role: role ?? null,
    });
    response.cookies.set(sessionCookieOptions.name, token, {
      httpOnly: sessionCookieOptions.httpOnly,
      sameSite: sessionCookieOptions.sameSite,
      secure: sessionCookieOptions.secure,
      path: sessionCookieOptions.path,
      maxAge: sessionCookieOptions.maxAge,
    });
    return response;
  } catch (error) {
    console.error("login failed:", error);
    return NextResponse.json(
      { error: "계정 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요." },
      { status: 503 },
    );
  }
}
