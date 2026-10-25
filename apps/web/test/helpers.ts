import { NextRequest, type NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@fabrica/db";
import { resetRateLimits } from "@/server/rate-limit";

export const BASE = "http://localhost:3000";
export const ADMIN = { email: "dono@teste.com", password: "senha-do-dono-123" };
export const ATENDENTE = { email: "atendente@teste.com", password: "senha-atendente-123" };

/** Banco limpo + tenant, configurações padrão, dono e atendente. */
export async function resetDb() {
  if (!process.env.DATABASE_URL?.includes("test")) {
    throw new Error("Por segurança os testes só rodam num banco cujo nome contenha 'test'");
  }
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
  resetRateLimits();

  const tenant = await prisma.tenant.create({
    data: { slug: "afabricamagica", branding: {}, settings: { create: {} } },
  });
  for (const [u, role] of [[ADMIN, "SUPER_ADMIN"], [ATENDENTE, "ATENDENTE"]] as const) {
    await prisma.user.create({
      data: { tenantId: tenant.id, email: u.email, passwordHash: await bcrypt.hash(u.password, 4), role },
    });
  }
  return tenant;
}

export function req(
  path: string,
  opts: { method?: string; body?: unknown; cookies?: Record<string, string>; headers?: Record<string, string> } = {},
) {
  const headers = new Headers(opts.headers);
  if (opts.body !== undefined) headers.set("content-type", "application/json");
  if (opts.cookies) {
    headers.set("cookie", Object.entries(opts.cookies).map(([k, v]) => `${k}=${v}`).join("; "));
  }
  return new NextRequest(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

export function cookiesOf(res: Response): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of (res as NextResponse).cookies.getAll()) out[c.name] = c.value;
  return out;
}

export const ctx = { params: {} };
