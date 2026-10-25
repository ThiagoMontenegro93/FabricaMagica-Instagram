import { NextResponse } from "next/server";
import { clientIp, route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { currentTenant } from "@/server/tenant";
import { REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from "@/server/auth/session";
import { refresh } from "@/server/services/auth.service";
import { AppError } from "@/server/errors";

export const runtime = "nodejs";

/** POST /api/auth/refresh — troca o refresh token (rotação) por um novo par. */
export const POST = route(async (req) => {
  const ip = clientIp(req);
  rateLimit(`refresh:${ip}`, 60, 60_000);
  const tenant = await currentTenant();
  try {
    const session = await refresh(tenant.id, req.cookies.get(REFRESH_COOKIE)?.value, ip);
    const res = NextResponse.json({ user: session.user });
    setAuthCookies(res, session.accessToken, session.refreshToken);
    return res;
  } catch (err) {
    if (err instanceof AppError && err.status === 401) {
      const res = NextResponse.json({ error: { code: err.code, message: err.message } }, { status: 401 });
      clearAuthCookies(res);
      return res;
    }
    throw err;
  }
});
