import { NextResponse } from "next/server";
import { route } from "@/server/http";
import { REFRESH_COOKIE, clearAuthCookies } from "@/server/auth/session";
import { logout } from "@/server/services/auth.service";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  await logout(req.cookies.get(REFRESH_COOKIE)?.value);
  const res = NextResponse.json({ ok: true });
  clearAuthCookies(res);
  return res;
});
