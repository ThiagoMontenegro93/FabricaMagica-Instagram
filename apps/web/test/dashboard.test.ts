import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@fabrica/db";
import { todayInStore } from "@fabrica/shared";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as dashboard } from "@/app/api/admin/dashboard/route";
import { GET as listDamages, POST as addDamage } from "@/app/api/reservations/[id]/damages/route";
import { DELETE as deleteDamage } from "@/app/api/reservations/[id]/damages/[damageId]/route";
import { audit } from "@/server/audit";
import { ADMIN, ATENDENTE, cookiesOf, ctx, req, resetDb } from "./helpers";

const staff = async (c: { email: string; password: string }) =>
  cookiesOf(await login(req("/api/auth/login", { method: "POST", body: c }), ctx)).fm_access!;
const day = (offset: number) => {
  const d = new Date(`${todayInStore()}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};

let tenantId: string;
let clientId: string;
let themeId: string;
let n = 0;

async function reservation(over: Record<string, unknown>) {
  return prisma.reservation.create({
    data: {
      code: `FM-T${String(++n).padStart(5, "2")}`,
      tenantId,
      clientId,
      eventDate: day(0),
      returnDate: day(0),
      deliveryType: "ENTREGA",
      subtotal: 250000,
      deliveryFee: 40000,
      totalPrice: 290000,
      themes: { create: { themeId, unitPrice: 250000 } },
      ...over,
    },
  });
}

beforeEach(async () => {
  tenantId = (await resetDb()).id;
  n = 0;
  clientId = (
    await prisma.client.create({
      data: {
        tenantId, name: "Wandinha Addams", cpf: "52998224725", rg: "1", birthDate: new Date("1990-01-01"), email: "w@teste.com",
        whatsapp: "21999990000", address: {}, lgpdConsent: true, contractAccepted: true,
      },
    })
  ).id;
  themeId = (
    await prisma.partyTheme.create({
      data: { tenantId, slug: "halloween", name: "Halloween", category: "Halloween", description: "x", dailyPrice: 250000, totalQty: 5 },
    })
  ).id;
});

describe("painel do dono (Sprint 6)", () => {
  it("separa saídas, devoluções, atrasos e próximos dias; dinheiro só para o dono", async () => {
    const paidNow = new Date();
    await reservation({ status: "PAGO", paidAt: paidNow }); // sai hoje
    await reservation({ status: "EM_LOCACAO", eventDate: day(-1), returnDate: day(0), paidAt: paidNow }); // volta hoje
    await reservation({ status: "EM_LOCACAO", eventDate: day(-4), returnDate: day(-2), paidAt: paidNow }); // vira atrasada
    await reservation({ status: "PAGO", eventDate: day(3), returnDate: day(3), paidAt: paidNow }); // próximos dias
    await reservation({ status: "PENDENTE", eventDate: day(5), returnDate: day(5), holdExpiresAt: new Date(Date.now() + 600_000) });
    await reservation({ status: "CANCELADO", paidAt: paidNow, cancelledAt: paidNow }); // fora do faturamento
    await reservation({ status: "PAGO", eventDate: day(30), returnDate: day(30), paidAt: paidNow }); // longe demais
    const late = await prisma.reservation.findFirstOrThrow({ where: { returnDate: day(-2) } });
    await audit({ tenantId, action: "PAYMENT_NEEDS_REVIEW", actorId: "mercadopago", targetId: late.id, metadata: { reason: "valor diferente" } });

    const owner = await (await dashboard(req("/api/admin/dashboard", { cookies: { fm_access: await staff(ADMIN) } }), ctx)).json();
    expect(owner.today).toBe(todayInStore());
    expect(owner.toLeave).toHaveLength(1);
    expect(owner.toLeave[0].items).toEqual(["Halloween"]);
    expect(owner.toReturn).toHaveLength(1);
    expect(owner.late).toHaveLength(1);
    expect(owner.late[0].status).toBe("ATRASADO");
    expect(owner.upcoming.map((r: { status: string }) => r.status).sort()).toEqual(["PAGO", "PENDENTE"]);
    expect(owner.pending).toEqual({ count: 1, total: 290000 });
    expect(owner.finance.revenue).toBe(5 * 290000);
    expect(owner.finance.count).toBe(5);
    expect(owner.finance.series).toHaveLength(6);
    expect(owner.finance.series.at(-1).total).toBe(5 * 290000);
    expect(owner.finance.topThemes[0]).toEqual({ name: "Halloween", quantity: 5 });
    expect(owner.finance.reviews[0]).toMatchObject({ code: late.code, reason: "valor diferente" });

    const att = await (await dashboard(req("/api/admin/dashboard", { cookies: { fm_access: await staff(ATENDENTE) } }), ctx)).json();
    expect(att.toLeave).toHaveLength(1);
    expect(att.finance).toBeNull();
  });

  it("cliente e visitante não acessam", async () => {
    expect((await dashboard(req("/api/admin/dashboard"), ctx)).status).toBe(401);
  });
});

describe("avarias na devolução", () => {
  const post = (token: string, id: string, body: unknown) =>
    addDamage(req(`/api/reservations/${id}/damages`, { method: "POST", body, cookies: { fm_access: token } }), { params: { id } });

  it("soma a multa ao total, só depois da saída, e só o dono desfaz", async () => {
    const pending = await reservation({ status: "PAGO", eventDate: day(3), returnDate: day(3) });
    const att = await staff(ATENDENTE);
    expect((await post(att, pending.id, { note: "Abóbora rachada", fee: 15000 })).status).toBe(409);

    const r = await reservation({ status: "EM_LOCACAO" });
    expect((await post(att, r.id, { note: "x", fee: 15000 })).status).toBe(400);
    expect((await post(att, r.id, { note: "Abóbora rachada", fee: 15000, themeId: "outro" })).status).toBe(400);
    const res = await post(att, r.code, { note: "Abóbora rachada", fee: 15000, themeId, photos: ["https://cdn.exemplo.com/a.jpg"] });
    expect(res.status).toBe(201);
    const { damage } = await res.json();
    expect(damage.theme.name).toBe("Halloween");

    let row = await prisma.reservation.findUniqueOrThrow({ where: { id: r.id } });
    expect(row.damageFee).toBe(15000);
    expect(row.totalPrice).toBe(290000 + 15000);

    const list = await (await listDamages(req(`/api/reservations/${r.id}/damages`, { cookies: { fm_access: att } }), { params: { id: r.id } })).json();
    expect(list.items).toHaveLength(1);

    const del = (token: string) =>
      deleteDamage(req(`/api/reservations/${r.id}/damages/${damage.id}`, { method: "DELETE", cookies: { fm_access: token } }), {
        params: { id: r.id, damageId: damage.id },
      });
    expect((await del(att)).status).toBe(403);
    expect((await del(await staff(ADMIN))).status).toBe(200);
    row = await prisma.reservation.findUniqueOrThrow({ where: { id: r.id } });
    expect(row.damageFee).toBe(0);
    expect(row.totalPrice).toBe(290000);
    expect(await prisma.auditLog.count({ where: { action: { in: ["DAMAGE_REPORT", "DAMAGE_DELETE"] } } })).toBe(2);
  });

  it("devolução depois da avaria mantém a multa no total", async () => {
    const r = await reservation({ status: "EM_LOCACAO" });
    const att = await staff(ATENDENTE);
    await post(att, r.id, { note: "Cortina rasgada", fee: 8000 });
    const { PATCH } = await import("@/app/api/reservations/[id]/status/route");
    const res = await PATCH(req(`/api/reservations/${r.id}/status`, { method: "PATCH", body: { status: "DEVOLVIDO" }, cookies: { fm_access: att } }), {
      params: { id: r.id },
    });
    expect(res.status).toBe(200);
    expect((await res.json()).reservation.totalPrice).toBe(290000 + 8000);
  });
});
