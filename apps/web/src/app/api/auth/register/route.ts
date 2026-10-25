import { NextResponse } from "next/server";
import { clientIp, readJson, route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { currentTenant } from "@/server/tenant";
import { setAuthCookies } from "@/server/auth/session";
import { register } from "@/server/services/auth.service";

export const runtime = "nodejs";

/** POST /api/auth/register — cria conta de CLIENTE e já abre a sessão. */
export const POST = route(async (req) => {
  const ip = clientIp(req);
  rateLimit(`register:${ip}`, 10, 60 * 60_000);
  const tenant = await currentTenant();
  const session = await register(tenant.id, await readJson(req), ip);
  const res = NextResponse.json({ user: session.user }, { status: 201 });
  setAuthCookies(res, session.accessToken, session.refreshToken);
  return res;
});
