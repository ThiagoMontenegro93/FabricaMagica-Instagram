import { prisma } from "@fabrica/db";
import { LoginSchema, RegisterSchema } from "@fabrica/shared";
import { Errors } from "../errors";
import { audit } from "../audit";
import { burnPasswordCheck, hashPassword, verifyPassword } from "../auth/password";
import { signAccessToken } from "../auth/jwt";
import { issueRefreshToken, revokeRefreshToken, rotateRefreshToken } from "../auth/refresh";
import { log } from "../logger";

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; role: string };
}

async function openSession(user: { id: string; tenantId: string; email: string; role: SessionTokens["user"]["role"] }) {
  const accessToken = await signAccessToken({ sub: user.id, tid: user.tenantId, role: user.role as never });
  const refreshToken = await issueRefreshToken(user.id);
  return { accessToken, refreshToken, user: { id: user.id, email: user.email, role: user.role } };
}

/**
 * Cadastro público: sempre cria CLIENTE. Papéis de equipe só são criados
 * pelo seed (SUPER_ADMIN) ou, no Sprint 6, pelo próprio dono no painel.
 */
export async function register(tenantId: string, input: unknown, ip?: string): Promise<SessionTokens> {
  const data = RegisterSchema.omit({ role: true }).parse(input);
  const exists = await prisma.user.findUnique({ where: { tenantId_email: { tenantId, email: data.email } } });
  if (exists) throw Errors.conflict("Este e-mail já tem cadastro. Faça login.");

  const user = await prisma.user.create({
    data: { tenantId, email: data.email, passwordHash: await hashPassword(data.password), role: "CLIENTE" },
  });
  await audit({ tenantId, action: "REGISTER", actorId: user.id, targetId: user.id, ip });
  return openSession(user);
}

export async function login(tenantId: string, input: unknown, ip?: string): Promise<SessionTokens> {
  const data = LoginSchema.parse(input);
  const user = await prisma.user.findUnique({ where: { tenantId_email: { tenantId, email: data.email } } });
  const ok = user && user.active ? await verifyPassword(data.password, user.passwordHash) : await burnPasswordCheck(data.password);

  if (!user || !ok) {
    log("warn", { action: "LOGIN_FAILED", tenantId, ip });
    throw Errors.unauthorized("E-mail ou senha inválidos");
  }
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ tenantId, action: "LOGIN", actorId: user.id, targetId: user.id, ip });
  return openSession(user);
}

export async function refresh(tenantId: string, refreshToken: string | undefined, ip?: string) {
  if (!refreshToken) throw Errors.unauthorized("Sessão expirada");
  const result = await rotateRefreshToken(refreshToken);
  if (!result.ok) {
    if (result.reason === "REUSED" && result.userId) {
      await audit({ tenantId, action: "REFRESH_REUSE_DETECTED", actorId: result.userId, targetId: result.userId, ip });
    }
    throw Errors.unauthorized("Sessão expirada");
  }
  const user = await prisma.user.findUnique({ where: { id: result.userId } });
  if (!user || !user.active || user.tenantId !== tenantId) throw Errors.unauthorized("Sessão expirada");
  const accessToken = await signAccessToken({ sub: user.id, tid: user.tenantId, role: user.role });
  return { accessToken, refreshToken: result.token, user: { id: user.id, email: user.email, role: user.role } };
}

export async function logout(refreshToken: string | undefined) {
  if (refreshToken) await revokeRefreshToken(refreshToken);
}

export async function me(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true, client: { select: { id: true, name: true } } },
  });
  if (!user) throw Errors.unauthorized();
  return user;
}

