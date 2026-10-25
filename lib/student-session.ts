import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

/** 교사 로그인(schoolapply_session)과 따로 쓰는 학생 쿠키. 한 조사에서만 유효하다. */
export const STUDENT_COOKIE_NAME = "schoolapply_student";
const STUDENT_MAX_AGE_SECONDS = 60 * 60 * 3;

export type StudentSession = { surveyId: string; studentNo: string };

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET 환경변수가 없습니다. .env.local을 확인하세요.");
  return new TextEncoder().encode(secret);
}

export async function createStudentToken(session: StudentSession) {
  return new SignJWT({ kind: "student", ...session })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${STUDENT_MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

async function verifyStudentToken(token: string | undefined): Promise<StudentSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.kind !== "student" || typeof payload.surveyId !== "string" || typeof payload.studentNo !== "string") {
      return null;
    }
    return { surveyId: payload.surveyId, studentNo: payload.studentNo };
  } catch {
    return null;
  }
}

export const studentCookieOptions = {
  name: STUDENT_COOKIE_NAME,
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: STUDENT_MAX_AGE_SECONDS,
};

function readCookie(cookieHeader: string | null) {
  for (const part of (cookieHeader ?? "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === STUDENT_COOKIE_NAME) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export async function getStudentSessionFromRequest(request: Request, surveyId: string) {
  const session = await verifyStudentToken(readCookie(request.headers.get("cookie")));
  return session?.surveyId === surveyId ? session : null;
}

export async function getServerStudentSession(surveyId: string) {
  const session = await verifyStudentToken((await cookies()).get(STUDENT_COOKIE_NAME)?.value);
  return session?.surveyId === surveyId ? session : null;
}
