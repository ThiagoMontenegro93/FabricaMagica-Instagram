import type { NextRequest, NextResponse } from "next/server";
import type { Role } from "@fabrica/shared";
import { Errors } from "../errors";
import { ACCESS_TTL_SECONDS, verifyAccessToken, type AccessClaims } from "./jwt";
import { REFRESH_TTL_DAYS } from "./refresh";

import { ACCESS_COOKIE, REFRESH_COOKIE } from "./session-cookies";
export { ACCESS_COOKIE, REFRESH_COOKIE };

const secure = process.env.NODE_ENV === "production";

export function setAuthCookies(res: NextResponse, accessToken: string, refreshToken: string) {
  res.cookies.set(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: ACCESS_TTL_SECONDS,
  });
  // O refresh só viaja para as rotas de auth.
  res.cookies.set(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/api/auth",
    maxAge: REFRESH_TTL_DAYS * 86_400,
  });
}

export function clearAuthCookies(res: NextResponse) {
  res.cookies.set(ACCESS_COOKIE, "", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 0 });
  res.cookies.set(REFRESH_COOKIE, "", { httpOnly: true, secure, sameSite: "lax", path: "/api/auth", maxAge: 0 });
}

/** Lê o access token do cookie ou do header Authorization: Bearer (PWA). */
export async function getAuth(req: NextRequest): Promise<AccessClaims | null> {
  const bearer = req.headers.get("authorization");
  const token = bearer?.startsWith("Bearer ") ? bearer.slice(7) : req.cookies.get(ACCESS_COOKIE)?.value;
  return token ? verifyAccessToken(token) : null;
}

/** RBAC (RF01): exige login e, se informado, um dos papéis. */
export async function requireAuth(req: NextRequest, roles?: readonly Role[]): Promise<AccessClaims> {
  const auth = await getAuth(req);
  if (!auth) throw Errors.unauthorized();
  if (roles && !roles.includes(auth.role)) throw Errors.forbidden();
  return auth;
}

export const STAFF_ROLES = ["SUPER_ADMIN", "ATENDENTE"] as const satisfies readonly Role[];
