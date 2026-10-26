import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@fabrica/db";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as register } from "@/app/api/auth/register/route";
import { GET as getSettings, PATCH as patchSettings } from "@/app/api/tenant/settings/route";
import { GET as publicSettings } from "@/app/api/tenant/public-settings/route";
import { GET as auditLogs } from "@/app/api/admin/audit-logs/route";
import { ADMIN, ATENDENTE, cookiesOf, ctx, req, resetDb } from "./helpers";

async function session(creds: { email: string; password: string }) {
  return cookiesOf(await login(req("/api/auth/login", { method: "POST", body: creds }), ctx)).fm_access!;
}

beforeEach(async () => {
  await resetDb();
});

describe("RF12 - Configurações de privacidade", () => {
  it("padrão: documentos desligados e cadastro orientado ao WhatsApp", async () => {
    const res = await publicSettings(req("/api/tenant/public-settings"), ctx);
    const body = await res.json();
    expect(body.documents).toEqual({ mode: "WHATSAPP" });
    expect(body.whatsappLink).toBe("https://wa.me/5521972848645");
  });

  it("só o SUPER_ADMIN altera; atendente lê mas não altera; cliente nem lê", async () => {
    const admin = await session(ADMIN);
    const atendente = await session(ATENDENTE);
    const cliente = cookiesOf(
      await register(req("/api/auth/register", { method: "POST", body: { email: "c@teste.com", password: "abcd1234" } }), ctx),
    ).fm_access!;

    expect((await getSettings(req("/api/tenant/settings", { cookies: { fm_access: atendente } }), ctx)).status).toBe(200);
    expect((await getSettings(req("/api/tenant/settings", { cookies: { fm_access: cliente } }), ctx)).status).toBe(403);

    const body = { hostSensitiveDocs: true };
    expect((await patchSettings(req("/api/tenant/settings", { method: "PATCH", body, cookies: { fm_access: atendente } }), ctx)).status).toBe(403);
    expect((await patchSettings(req("/api/tenant/settings", { method: "PATCH", body, cookies: { fm_access: cliente } }), ctx)).status).toBe(403);
    expect((await patchSettings(req("/api/tenant/settings", { method: "PATCH", body }), ctx)).status).toBe(401);

    const ok = await patchSettings(req("/api/tenant/settings", { method: "PATCH", body, cookies: { fm_access: admin } }), ctx);
    expect(ok.status).toBe(200);
    expect((await ok.json()).settings.hostSensitiveDocs).toBe(true);

    const pub = await (await publicSettings(req("/api/tenant/public-settings"), ctx)).json();
    expect(pub.documents).toEqual({ mode: "UPLOAD", requireProof: true, requireSelfie: false });
  });

  it("toda mudança vai para o AuditLog com antes e depois, e só o dono vê os logs", async () => {
    const admin = await session(ADMIN);
    await patchSettings(
      req("/api/tenant/settings", { method: "PATCH", body: { hostSensitiveDocs: true, retentionDays: 30, weekendMultiplier: 1.3 }, cookies: { fm_access: admin } }),
      ctx,
    );
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "UPDATE_SETTINGS" } });
    // weekendMultiplier não mudou (1.3 -> 1.3), então não aparece.
    expect(log.metadata).toEqual({ hostSensitiveDocs: { from: false, to: true }, retentionDays: { from: 90, to: 30 } });

    const list = await auditLogs(req("/api/admin/audit-logs?action=UPDATE_SETTINGS", { cookies: { fm_access: admin } }), ctx);
    expect((await list.json()).items).toHaveLength(1);
    const atendente = await session(ATENDENTE);
    expect((await auditLogs(req("/api/admin/audit-logs", { cookies: { fm_access: atendente } }), ctx)).status).toBe(403);
  });

  it("frete: o dono define e o site público recebe o valor", async () => {
    const admin = await session(ADMIN);
    const ok = await patchSettings(req("/api/tenant/settings", { method: "PATCH", body: { deliveryFeeBase: 40000 }, cookies: { fm_access: admin } }), ctx);
    expect((await ok.json()).settings.deliveryFeeBase).toBe(40000);
    expect((await (await publicSettings(req("/api/tenant/public-settings"), ctx)).json()).deliveryFee).toBe(40000);
    const bad = await patchSettings(req("/api/tenant/settings", { method: "PATCH", body: { deliveryFeeBase: 400.5 }, cookies: { fm_access: admin } }), ctx);
    expect(bad.status).toBe(400);
  });

  it("valida retenção (30/90/365) e multiplicador", async () => {
    const admin = await session(ADMIN);
    const bad = await patchSettings(req("/api/tenant/settings", { method: "PATCH", body: { retentionDays: 45 }, cookies: { fm_access: admin } }), ctx);
    expect(bad.status).toBe(400);
    const bad2 = await patchSettings(req("/api/tenant/settings", { method: "PATCH", body: { weekendMultiplier: 0.5 }, cookies: { fm_access: admin } }), ctx);
    expect(bad2.status).toBe(400);
  });
});
