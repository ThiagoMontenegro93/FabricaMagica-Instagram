/**
 * Access token JWT (HS256, 15 min). Só depende de `jose`, então roda também
 * no middleware (Edge runtime). Não importar Prisma ou Node APIs aqui.
 */
import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@fabrica/shared";

export const ACCESS_TTL_SECONDS = 15 * 60;
const ISSUER = "fabrica-magica";

export interface AccessClaims {
  sub: string; // userId
  tid: string; // tenantId
  role: Role;
}

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error("JWT_SECRET ausente ou curto (mínimo 32 caracteres)");
  return new TextEncoder().encode(s);
}

export async function signAccessToken(claims: AccessClaims): Promise<string> {
  return new SignJWT({ tid: claims.tid, role: claims.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(secret());
}

/** Retorna as claims ou null se o token for inválido/expirado. */
export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: ISSUER, algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.tid !== "string" || typeof payload.role !== "string") {
      return null;
    }
    return { sub: payload.sub, tid: payload.tid, role: payload.role as Role };
  } catch {
    return null;
  }
}
