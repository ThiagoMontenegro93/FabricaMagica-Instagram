import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@fabrica/db";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as createClient } from "@/app/api/clients/route";
import { POST as createReservation } from "@/app/api/reservations/route";
import { POST as pix } from "@/app/api/reservations/[id]/pix/route";
import { POST as card } from "@/app/api/reservations/[id]/card/route";
import { POST as simulate } from "@/app/api/reservations/[id]/simulate/route";
import { POST as webhook } from "@/app/api/payments/webhook/route";
import { resetEnvCache } from "@/server/env";
import { cookiesOf, ctx, req, resetDb } from "./helpers";

const SECRET = "segredo-do-webhook-de-teste";
let token: string;
let reservation: { id: string; code: string; totalPrice: number };

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetEnvCache();
}

beforeEach(async () => {
  const tenantId = (await resetDb()).id;
  token = cookiesOf(await register(req("/api/auth/register", { method: "POST", body: { email: "c@teste.com", password: "abcd1234" } }), ctx)).fm_access!;
  await createClient(
    req("/api/clients", {
      method: "POST",
      cookies: { fm_access: token },
      body: {
        name: "Morticia Addams", cpf: "52998224725", rg: "123456", birthDate: "1990-01-01", email: "c@teste.com", whatsapp: "21999990000",
        address: { cep: "20770001", rua: "Rua A", numero: "1", bairro: "Méier", cidade: "Rio de Janeiro", estado: "RJ" },
        lgpdConsent: true, contractAccepted: true,
      },
    }),
    ctx,
  );
  const theme = await prisma.partyTheme.create({ data: { tenantId, slug: "t", name: "Halloween", category: "X", description: "Tema de teste", dailyPrice: 120000 } });
  const date = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
  const res = await createReservation(
    req("/api/reservations", { method: "POST", cookies: { fm_access: token }, body: { eventDate: date, deliveryType: "RETIRADA", themes: [{ themeId: theme.id }] } }),
    ctx,
  );
  reservation = (await res.json()).reservation;
});

afterEach(() => {
  vi.unstubAllGlobals();
  setEnv({ MERCADOPAGO_ACCESS_TOKEN: undefined, MERCADOPAGO_WEBHOOK_SECRET: undefined, PAYMENTS_SIMULATOR: undefined, APP_ORIGIN: undefined });
});

const call = (handler: typeof pix, id = reservation.id) =>
  handler(req(`/api/reservations/${id}/x`, { method: "POST", cookies: { fm_access: token } }), { params: { id } });

function signed(dataId: string, ts = "1730000000", requestId = "req-1") {
  const v1 = createHmac("sha256", SECRET).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest("hex");
  return req(`/api/payments/webhook?data.id=${dataId}&type=payment`, {
    method: "POST",
    body: { type: "payment", action: "payment.updated", data: { id: dataId } },
    headers: { "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": requestId },
  });
}

/** Mercado Pago falso: guarda as chamadas e responde Pix/pagamento. */
function fakeMercadoPago(payment: { status: string; amount: number; ref?: string; updated?: string }) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.endsWith("/v1/payments") && init?.method === "POST") {
      return Response.json({ id: 999, status: "pending", transaction_amount: payment.amount, point_of_interaction: { transaction_data: { qr_code: "000201PIXREAL", qr_code_base64: "iVBOR" } } });
    }
    if (url.includes("/checkout/preferences")) return Response.json({ id: "pref-1", init_point: "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=pref-1" });
    return Response.json({ id: 999, status: payment.status, transaction_amount: payment.amount, external_reference: payment.ref ?? reservation.id, date_last_updated: payment.updated ?? "2026-11-01T10:00:00.000-03:00" });
  }));
  return calls;
}

describe("sem Mercado Pago configurado", () => {
  it("pagamento online fica indisponível (combinado pelo WhatsApp)", async () => {
    expect((await call(pix)).status).toBe(409);
    expect((await call(simulate)).status).toBe(404);
  });

  it("simulador confirma uma vez e só fora de produção", async () => {
    setEnv({ PAYMENTS_SIMULATOR: "1" });
    const p = await (await call(pix)).json();
    expect(p.simulated).toBe(true);
    expect((await call(simulate)).status).toBe(200);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } })).status).toBe("PAGO");
    expect((await call(simulate)).status).toBe(409);
  });
});

describe("Mercado Pago", () => {
  beforeEach(() => setEnv({ MERCADOPAGO_ACCESS_TOKEN: "TOKEN_DE_TESTE", MERCADOPAGO_WEBHOOK_SECRET: SECRET, APP_ORIGIN: "https://loja.exemplo.com" }));

  it("gera Pix com idempotência, CPF do pagador e vencimento da reserva", async () => {
    const calls = fakeMercadoPago({ status: "pending", amount: 1200 });
    const p = await (await call(pix)).json();
    expect(p.qrCode).toBe("000201PIXREAL");
    expect(p.qrCodeBase64).toBe("iVBOR");
    const sent = JSON.parse(String(calls[0]!.init!.body));
    expect((calls[0]!.init!.headers as Record<string, string>)["X-Idempotency-Key"]).toBe(`pix-${reservation.id}`);
    expect(sent.transaction_amount).toBe(1200);
    expect(sent.payer.identification).toEqual({ type: "CPF", number: "52998224725" });
    expect(sent.notification_url).toBe("https://loja.exemplo.com/api/payments/webhook");
    expect(sent.date_of_expiration).toMatch(/-03:00$/);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } })).paymentId).toBe("999");

    // Segundo clique reaproveita o mesmo pagamento.
    await call(pix);
    expect(calls.filter((c) => c.init?.method === "POST")).toHaveLength(1);
  });

  it("cartão abre o Checkout Pro sem boleto", async () => {
    const calls = fakeMercadoPago({ status: "pending", amount: 1200 });
    const c = await (await call(card)).json();
    expect(c.url).toContain("mercadopago.com.br");
    const sent = JSON.parse(String(calls[0]!.init!.body));
    expect(sent.payment_methods.excluded_payment_types).toEqual([{ id: "ticket" }]);
    expect(sent.items[0].unit_price).toBe(1200);
  });

  it("webhook assinado aprova a reserva uma única vez", async () => {
    fakeMercadoPago({ status: "approved", amount: 1200 });
    const res = await webhook(signed("999"), ctx);
    expect(res.status).toBe(200);
    const r = await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } });
    expect(r.status).toBe("PAGO");
    expect(r.holdExpiresAt).toBeNull();

    expect((await (await webhook(signed("999"), ctx)).json()).duplicate).toBe(true);
    expect(await prisma.paymentEvent.count()).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "PAYMENT_APPROVED" } })).toBe(1);
  });

  it("recusa assinatura inválida sem consultar o Mercado Pago", async () => {
    const calls = fakeMercadoPago({ status: "approved", amount: 1200 });
    const bad = req("/api/payments/webhook?data.id=999&type=payment", {
      method: "POST",
      body: { type: "payment", data: { id: "999" } },
      headers: { "x-signature": "ts=1,v1=" + "0".repeat(64), "x-request-id": "r" },
    });
    expect((await webhook(bad, ctx)).status).toBe(401);
    expect(calls).toHaveLength(0);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } })).status).toBe("PENDENTE");
  });

  it("valor diferente ou pagamento após cancelamento vão para revisão", async () => {
    fakeMercadoPago({ status: "approved", amount: 10 });
    await webhook(signed("999"), ctx);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } })).status).toBe("PENDENTE");

    await prisma.reservation.update({ where: { id: reservation.id }, data: { status: "CANCELADO" } });
    vi.unstubAllGlobals();
    fakeMercadoPago({ status: "approved", amount: 1200, updated: "2026-11-01T11:00:00.000-03:00" });
    await webhook(signed("999", "1730000099"), ctx);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } })).status).toBe("CANCELADO");
    expect(await prisma.auditLog.count({ where: { action: "PAYMENT_NEEDS_REVIEW" } })).toBe(2);
  });
});
