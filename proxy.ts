import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/session";

const PUBLIC_PATHS = ["/login", "/apply", "/privacy"];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return (
    pathname.startsWith("/s/") ||
    pathname.startsWith("/api/s/") ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/schools/") ||
    pathname.startsWith("/api/account-requests")
  );
}

function isAdminArea(pathname: string): boolean {
  return (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname.startsWith("/api/admin")
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const session = await getSessionFromRequest(request);
  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isAdminArea(pathname) && session.role !== "admin") {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "관리자만 이용할 수 있습니다." }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (
    session.role === "admin" &&
    !isAdminArea(pathname) &&
    pathname !== "/api/auth/logout"
  ) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "관리자 계정은 이 기능을 사용할 수 없습니다." },
        { status: 403 },
      );
    }
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
