import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@fabrica/db";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as refresh } from "@/app/api/auth/refresh/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as me } from "@/app/api/auth/me/route";
import { ADMIN, cookiesOf, ctx, req, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
});

describe("RF01 - cadastro de conta", () => {
  it("cria CLIENTE, abre sessão e ignora tentativa de escolher papel", async () => {
    const res = await register(req("/api/auth/register", { method: "POST", body: { email: "Ana@Teste.com", password: "abcd1234", role: "SUPER_ADMIN" } }), ctx);
    expect(res.status).toBe(201);
    expect((await res.json()).user).toMatchObject({ email: "ana@teste.com", role: "CLIENTE" });
    const c = cookiesOf(res);
    expect(c.fm_access).toBeTruthy();
    expect(c.fm_refresh).toBeTruthy();
    const user = await prisma.user.findFirstOrThrow({ where: { email: "ana@teste.com" } });
    expect(user.passwordHash).not.toContain("abcd1234");
    expect(user.passwordHash.startsWith("$2")).toBe(true);
  });

  it("recusa e-mail repetido (409) e senha fraca (400)", async () => {
    await register(req("/api/auth/register", { method: "POST", body: { email: "ana@teste.com", password: "abcd1234" } }), ctx);
    const dup = await register(req("/api/auth/register", { method: "POST", body: { email: "ANA@teste.com", password: "abcd1234" } }), ctx);
    expect(dup.status).toBe(409);
    const weak = await register(req("/api/auth/register", { method: "POST", body: { email: "b@teste.com", password: "12345678" } }), ctx);
    expect(weak.status).toBe(400);
  });
});

describe("RF01 - login", () => {
  it("senha errada e e-mail inexistente dão a mesma resposta 401", async () => {
    const wrong = await login(req("/api/auth/login", { method: "POST", body: { email: ADMIN.email, password: "errada" } }), ctx);
    const ghost = await login(req("/api/auth/login", { method: "POST", body: { email: "ninguem@teste.com", password: "errada" } }), ctx);
    expect(wrong.status).toBe(401);
    expect(ghost.status).toBe(401);
    expect(await wrong.json()).toEqual(await ghost.json());
  });

  it("login certo devolve papel e registra no AuditLog", async () => {
    const res = await login(req("/api/auth/login", { method: "POST", body: ADMIN }), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).user.role).toBe("SUPER_ADMIN");
    expect(await prisma.auditLog.count({ where: { action: "LOGIN" } })).toBe(1);
  });

  it("rate limit: 6ª tentativa no mesmo e-mail em 1 min dá 429", async () => {
    for (let i = 0; i < 5; i++) {
      await login(req("/api/auth/login", { method: "POST", body: { email: ADMIN.email, password: "errada" } }), ctx);
    }
    const res = await login(req("/api/auth/login", { method: "POST", body: ADMIN }), ctx);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
  });

  it("anti-CSRF: POST vindo de outra origem é recusado", async () => {
    const res = await login(req("/api/auth/login", { method: "POST", body: ADMIN, headers: { origin: "https://site-malicioso.com" } }), ctx);
    expect(res.status).toBe(403);
  });
});

describe("Sessão", () => {
  it("/me exige login", async () => {
    expect((await me(req("/api/auth/me"), ctx)).status).toBe(401);
    const s = cookiesOf(await login(req("/api/auth/login", { method: "POST", body: ADMIN }), ctx));
    const res = await me(req("/api/auth/me", { cookies: { fm_access: s.fm_access! } }), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).user.email).toBe(ADMIN.email);
  });

  it("aceita Authorization: Bearer (PWA)", async () => {
    const s = cookiesOf(await login(req("/api/auth/login", { method: "POST", body: ADMIN }), ctx));
    const res = await me(req("/api/auth/me", { headers: { authorization: `Bearer ${s.fm_access}` } }), ctx);
    expect(res.status).toBe(200);
  });

  it("token adulterado é recusado", async () => {
    const s = cookiesOf(await login(req("/api/auth/login", { method: "POST", body: ADMIN }), ctx));
    const tampered = s.fm_access!.slice(0, -3) + "abc";
    expect((await me(req("/api/auth/me", { cookies: { fm_access: tampered } }), ctx)).status).toBe(401);
  });

  it("refresh rotaciona; reapresentar o token antigo derruba todas as sessões", async () => {
    const first = cookiesOf(await login(req("/api/auth/login", { method: "POST", body: ADMIN }), ctx));

    const r1 = await refresh(req("/api/auth/refresh", { method: "POST", cookies: { fm_refresh: first.fm_refresh! } }), ctx);
    expect(r1.status).toBe(200);
    const second = cookiesOf(r1);
    expect(second.fm_refresh).not.toBe(first.fm_refresh);

    const reuse = await refresh(req("/api/auth/refresh", { method: "POST", cookies: { fm_refresh: first.fm_refresh! } }), ctx);
    expect(reuse.status).toBe(401);
    expect(await prisma.auditLog.count({ where: { action: "REFRESH_REUSE_DETECTED" } })).toBe(1);

    // O token novo também foi revogado por segurança.
    const after = await refresh(req("/api/auth/refresh", { method: "POST", cookies: { fm_refresh: second.fm_refresh! } }), ctx);
    expect(after.status).toBe(401);
  });

  it("logout revoga o refresh e limpa cookies", async () => {
    const s = cookiesOf(await login(req("/api/auth/login", { method: "POST", body: ADMIN }), ctx));
    const out = await logout(req("/api/auth/logout", { method: "POST", cookies: { fm_refresh: s.fm_refresh! } }), ctx);
    expect(cookiesOf(out).fm_access).toBe("");
    const r = await refresh(req("/api/auth/refresh", { method: "POST", cookies: { fm_refresh: s.fm_refresh! } }), ctx);
    expect(r.status).toBe(401);
  });
});
