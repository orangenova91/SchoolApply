import { NextResponse } from "next/server";
import { studentCookieOptions } from "@/lib/student-session";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({ ...studentCookieOptions, value: "", maxAge: 0 });
  return response;
}
