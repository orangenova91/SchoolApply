import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { findAccountById, isAdminAccount } from "@/lib/accounts";

export const SESSION_COOKIE_NAME = "schoolapply_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type SessionPayload = {
  accountId: string;
  username: string;
  role?: "admin";
};

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET 환경변수가 없습니다. .env.local을 확인하세요.");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (typeof payload.accountId !== "string" || typeof payload.username !== "string") {
      return null;
    }
    const role = payload.role === "admin" ? "admin" : undefined;
    return {
      accountId: payload.accountId,
      username: payload.username,
      ...(role ? { role } : {}),
    };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  name: SESSION_COOKIE_NAME,
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
};

function extractSessionCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === SESSION_COOKIE_NAME) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}

export async function getSessionFromRequest(request: Request): Promise<SessionPayload | null> {
  const token = extractSessionCookie(request.headers.get("cookie"));
  if (!token) return null;
  return sessionIfAccountExists(await verifySessionToken(token));
}

export async function getServerSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return sessionIfAccountExists(await verifySessionToken(token));
}

async function sessionIfAccountExists(
  session: SessionPayload | null,
): Promise<SessionPayload | null> {
  if (!session) return null;
  const account = await findAccountById(session.accountId);
  if (!account || account.isDemo) return null;
  return {
    accountId: session.accountId,
    username: account.username,
    ...(isAdminAccount(account) ? { role: "admin" as const } : {}),
  };
}
