import { NextResponse } from "next/server";
import { clientIp, readJson, route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { currentTenant } from "@/server/tenant";
import { setAuthCookies } from "@/server/auth/session";
import { login } from "@/server/services/auth.service";

export const runtime = "nodejs";

/** POST /api/auth/login — 5 tentativas por minuto por IP e por e-mail. */
export const POST = route(async (req) => {
  const ip = clientIp(req);
  const body = await readJson(req);
  const email = typeof (body as { email?: unknown })?.email === "string" ? (body as { email: string }).email.toLowerCase() : "";
  rateLimit(`login:ip:${ip}`, 20, 60_000);
  if (email) rateLimit(`login:email:${email}`, 5, 60_000);

  const tenant = await currentTenant();
  const session = await login(tenant.id, body, ip);
  const res = NextResponse.json({ user: session.user });
  setAuthCookies(res, session.accessToken, session.refreshToken);
  return res;
});
