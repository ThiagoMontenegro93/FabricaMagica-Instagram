import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@fabrica/db";

export const REFRESH_TTL_DAYS = 30;

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Cria um refresh token opaco; no banco fica só o hash. */
export async function issueRefreshToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 86_400_000),
    },
  });
  return token;
}

export type RotateResult =
  | { ok: true; userId: string; token: string }
  | { ok: false; reason: "INVALID" | "EXPIRED" | "REUSED"; userId?: string };

/**
 * Rotação: cada refresh só vale uma vez. Se um token já revogado for reapresentado,
 * alguém copiou o token: revoga todas as sessões do usuário.
 */
export async function rotateRefreshToken(token: string): Promise<RotateResult> {
  const found = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!found) return { ok: false, reason: "INVALID" };
  if (found.revokedAt) {
    await revokeAllForUser(found.userId);
    return { ok: false, reason: "REUSED", userId: found.userId };
  }
  if (found.expiresAt <= new Date()) return { ok: false, reason: "EXPIRED", userId: found.userId };

  // updateMany com revokedAt null garante que duas chamadas simultâneas não rotacionem o mesmo token.
  const { count } = await prisma.refreshToken.updateMany({
    where: { id: found.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (count === 0) {
    await revokeAllForUser(found.userId);
    return { ok: false, reason: "REUSED", userId: found.userId };
  }
  return { ok: true, userId: found.userId, token: await issueRefreshToken(found.userId) };
}

export async function revokeRefreshToken(token: string) {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: sha256(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllForUser(userId: string) {
  await prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}
