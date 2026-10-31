import { createHmac, timingSafeEqual } from "node:crypto";
import { Prisma, prisma } from "@fabrica/db";
import type { Role } from "@fabrica/shared";
import { AppError, Errors } from "../errors";
import { audit } from "../audit";
import { env } from "../env";
import { log } from "../logger";
import { refreshStatuses } from "./reservation.service";

type Actor = { id: string; role: Role };
const MP_API = "https://api.mercadopago.com";

export type PaymentsMode = "mercadopago" | "simulado" | "off";

/** Mercado Pago com token; simulador só fora de produção; senão, pagamento pelo WhatsApp. */
export function paymentsMode(): PaymentsMode {
  const e = env();
  if (e.MERCADOPAGO_ACCESS_TOKEN) return "mercadopago";
  if (e.PAYMENTS_SIMULATOR === "1" && e.NODE_ENV !== "production") return "simulado";
  return "off";
}

async function mp<T>(path: string, init: { method?: string; body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
  const res = await fetch(`${MP_API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${env().MERCADOPAGO_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      ...(init.idempotencyKey ? { "X-Idempotency-Key": init.idempotencyKey } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) {
    log("error", { action: "MERCADOPAGO_ERROR", path, status: res.status, message: data.message });
    throw new AppError(502, "PAYMENT_PROVIDER", "Não conseguimos falar com o Mercado Pago. Tente de novo em instantes.");
  }
  return data;
}

function origin() {
  const o = env().APP_ORIGIN;
  if (!o) throw new AppError(500, "CONFIG", "APP_ORIGIN não configurado");
  return o.replace(/\/$/, "");
}

/** "2026-11-01T12:30:00.000-03:00": formato com fuso que o Mercado Pago aceita. */
function mpDate(d: Date) {
  return `${new Date(d.getTime() - 3 * 3_600_000).toISOString().replace("Z", "")}-03:00`;
}

/** Reserva do cliente (ou qualquer uma, para a equipe) pronta para pagar. */
async function payable(tenantId: string, actor: Actor, id: string) {
  await refreshStatuses(tenantId);
  const r = await prisma.reservation.findFirst({
    where: { tenantId, OR: [{ id }, { code: id.toUpperCase() }] },
    select: {
      id: true, code: true, status: true, totalPrice: true, holdExpiresAt: true, paymentId: true, pixQrCode: true,
      client: { select: { userId: true, name: true, email: true, cpf: true } },
    },
  });
  const staff = actor.role === "SUPER_ADMIN" || actor.role === "ATENDENTE";
  if (!r || (!staff && r.client.userId !== actor.id)) throw Errors.notFound("Reserva não encontrada");
  if (r.status !== "PENDENTE" || !r.holdExpiresAt) throw Errors.conflict("Esta reserva não está aguardando pagamento.");
  return r as typeof r & { holdExpiresAt: Date };
}

interface MpPayment {
  id: number;
  status: string;
  status_detail?: string;
  external_reference?: string;
  transaction_amount: number;
  date_last_updated?: string;
  point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string; ticket_url?: string } };
}

/** RF05: Pix com QR Code e copia-e-cola, vencendo junto com a reserva temporária. */
export async function createPix(tenantId: string, actor: Actor, id: string, ip?: string) {
  const r = await payable(tenantId, actor, id);
  const mode = paymentsMode();
  if (mode === "off") throw Errors.conflict("Pagamento online indisponível. Fale com a loja pelo WhatsApp.");

  if (mode === "simulado") {
    const code = `00020126SIMULADO-${r.code}-5204000053039865802BR`;
    await prisma.reservation.update({ where: { id: r.id }, data: { pixQrCode: code, paymentId: `SIM-${r.id}` } });
    return { qrCode: code, qrCodeBase64: null, ticketUrl: null, expiresAt: r.holdExpiresAt, simulated: true };
  }

  // A mesma chave de idempotência devolve o mesmo Pix se o cliente clicar duas vezes.
  const [first = "Cliente", ...rest] = r.client.name.split(" ");
  const payment = r.paymentId
    ? await mp<MpPayment>(`/v1/payments/${r.paymentId}`)
    : await mp<MpPayment>("/v1/payments", {
        method: "POST",
        idempotencyKey: `pix-${r.id}`,
        body: {
          transaction_amount: r.totalPrice / 100,
          description: `Reserva ${r.code} - A Fábrica Mágica`,
          payment_method_id: "pix",
          external_reference: r.id,
          notification_url: `${origin()}/api/payments/webhook`,
          date_of_expiration: mpDate(r.holdExpiresAt),
          payer: {
            email: r.client.email,
            first_name: first,
            last_name: rest.join(" ") || first,
            identification: { type: "CPF", number: r.client.cpf },
          },
        },
      });
  const tx = payment.point_of_interaction?.transaction_data ?? {};
  await prisma.reservation.update({ where: { id: r.id }, data: { paymentId: String(payment.id), pixQrCode: tx.qr_code ?? null } });
  if (!r.paymentId) {
    await audit({ tenantId, action: "PAYMENT_CREATED", actorId: actor.id, targetId: r.id, ip, metadata: { method: "pix", paymentId: String(payment.id) } });
  }
  return { qrCode: tx.qr_code ?? null, qrCodeBase64: tx.qr_code_base64 ?? null, ticketUrl: tx.ticket_url ?? null, expiresAt: r.holdExpiresAt, simulated: false };
}

/** RF05: cartão (até 12x) pelo Checkout Pro; o link expira com a reserva temporária. */
export async function createCardCheckout(tenantId: string, actor: Actor, id: string, ip?: string) {
  const r = await payable(tenantId, actor, id);
  const mode = paymentsMode();
  if (mode === "off") throw Errors.conflict("Pagamento online indisponível. Fale com a loja pelo WhatsApp.");
  if (mode === "simulado") return { url: `/reservas/${r.code}?simular=cartao`, simulated: true };

  const pref = await mp<{ id: string; init_point: string }>("/checkout/preferences", {
    method: "POST",
    idempotencyKey: `card-${r.id}`,
    body: {
      items: [{ id: r.code, title: `Reserva ${r.code} - A Fábrica Mágica`, quantity: 1, unit_price: r.totalPrice / 100, currency_id: "BRL" }],
      payer: { email: r.client.email },
      external_reference: r.id,
      notification_url: `${origin()}/api/payments/webhook`,
      back_urls: {
        success: `${origin()}/reservas/${r.code}`,
        pending: `${origin()}/reservas/${r.code}`,
        failure: `${origin()}/reservas/${r.code}`,
      },
      auto_return: "approved",
      expires: true,
      expiration_date_to: mpDate(r.holdExpiresAt),
      payment_methods: { excluded_payment_types: [{ id: "ticket" }], installments: 12 },
      statement_descriptor: "FABRICAMAGICA",
    },
  });
  await audit({ tenantId, action: "PAYMENT_CREATED", actorId: actor.id, targetId: r.id, ip, metadata: { method: "card", preferenceId: pref.id } });
  return { url: pref.init_point, simulated: false };
}

/**
 * RN10: único caminho automático para PAGO. Idempotente (PaymentEvent único por evento),
 * confere o valor e só confirma reserva ainda PENDENTE. Pagamento que chega depois do
 * cancelamento vai para revisão manual (estorno), nunca reabre estoque sozinho.
 */
export async function applyPayment(p: { provider: string; paymentId: string; status: string; amountCents: number; reservationId: string; payload: unknown; eventKey: string }) {
  const r = await prisma.reservation.findUnique({ where: { id: p.reservationId }, select: { id: true, tenantId: true, status: true, totalPrice: true, code: true } });
  if (!r) {
    log("warn", { action: "PAYMENT_UNKNOWN_RESERVATION", paymentId: p.paymentId });
    return { handled: false };
  }
  try {
    await prisma.paymentEvent.create({
      data: { reservationId: r.id, provider: p.provider, externalId: p.eventKey, status: p.status, amount: p.amountCents, payload: p.payload as Prisma.InputJsonValue },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { handled: true, duplicate: true };
    throw err;
  }
  if (p.status !== "approved") return { handled: true };

  if (p.amountCents !== r.totalPrice) {
    await audit({ tenantId: r.tenantId, action: "PAYMENT_NEEDS_REVIEW", actorId: p.provider, targetId: r.id, metadata: { reason: "valor diferente", paid: p.amountCents, expected: r.totalPrice } });
    return { handled: true };
  }
  const { count } = await prisma.reservation.updateMany({
    where: { id: r.id, status: "PENDENTE" },
    data: { status: "PAGO", paidAt: new Date(), holdExpiresAt: null, paymentId: p.paymentId },
  });
  if (count === 1) {
    await audit({ tenantId: r.tenantId, action: "PAYMENT_APPROVED", actorId: p.provider, targetId: r.id, metadata: { paymentId: p.paymentId } });
  } else if (r.status === "CANCELADO") {
    log("warn", { action: "PAYMENT_AFTER_CANCEL", reservation: r.code, paymentId: p.paymentId });
    await audit({ tenantId: r.tenantId, action: "PAYMENT_NEEDS_REVIEW", actorId: p.provider, targetId: r.id, metadata: { reason: "pago depois de cancelada", paymentId: p.paymentId } });
  }
  return { handled: true };
}

/** Assinatura do webhook: HMAC-SHA256 de "id:<data.id>;request-id:<x-request-id>;ts:<ts>;". */
export function verifyWebhookSignature(h: { signature: string | null; requestId: string | null; dataId: string | null }, secret: string) {
  const parts = Object.fromEntries((h.signature ?? "").split(",").map((p) => p.split("=", 2).map((x) => x.trim())));
  if (!parts.ts || !parts.v1) return false;
  const id = h.dataId && /^[a-z0-9]+$/i.test(h.dataId) ? h.dataId.toLowerCase() : h.dataId;
  const manifest = `${id ? `id:${id};` : ""}${h.requestId ? `request-id:${h.requestId};` : ""}ts:${parts.ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest();
  const given = Buffer.from(parts.v1, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** POST /api/payments/webhook: valida a origem e busca o pagamento na API (nunca confia no corpo). */
export async function handleWebhook(input: { signature: string | null; requestId: string | null; dataId: string | null; type: string | null; body: unknown }) {
  const secret = env().MERCADOPAGO_WEBHOOK_SECRET;
  if (secret) {
    if (!verifyWebhookSignature(input, secret)) throw Errors.unauthorized("Assinatura inválida");
  } else if (env().NODE_ENV === "production") {
    throw new AppError(500, "CONFIG", "MERCADOPAGO_WEBHOOK_SECRET não configurado");
  }
  if (input.type !== "payment" || !input.dataId) return { ignored: true };
  if (paymentsMode() !== "mercadopago") return { ignored: true };

  const payment = await mp<MpPayment>(`/v1/payments/${encodeURIComponent(input.dataId)}`);
  if (!payment.external_reference) return { ignored: true };
  return applyPayment({
    provider: "MERCADOPAGO",
    paymentId: String(payment.id),
    status: payment.status,
    amountCents: Math.round(payment.transaction_amount * 100),
    reservationId: payment.external_reference,
    payload: { id: payment.id, status: payment.status, status_detail: payment.status_detail, amount: payment.transaction_amount },
    eventKey: `${payment.id}:${payment.status}:${payment.date_last_updated ?? ""}`,
  });
}

/** Simulador (fora de produção): confirma como se o Mercado Pago tivesse aprovado. */
export async function simulatePayment(tenantId: string, actor: Actor, id: string) {
  if (paymentsMode() !== "simulado") throw Errors.notFound("Não encontrado");
  const r = await payable(tenantId, actor, id);
  await applyPayment({
    provider: "SIMULADOR",
    paymentId: `SIM-${r.id}`,
    status: "approved",
    amountCents: r.totalPrice,
    reservationId: r.id,
    payload: { simulated: true },
    eventKey: `SIM-${r.id}:approved`,
  });
  return prisma.reservation.findUniqueOrThrow({ where: { id: r.id }, select: { status: true, code: true } });
}

