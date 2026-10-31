import { clientIp, json, readJson, route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { handleWebhook } from "@/server/services/payment.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/payments/webhook — notificações do Mercado Pago (RN10: só aqui a reserva vira PAGO). */
export const POST = route(async (req) => {
  rateLimit(`webhook:${clientIp(req)}`, 300, 60_000);
  const body = (await readJson(req).catch(() => ({}))) as { type?: string; data?: { id?: string | number } };
  const sp = req.nextUrl.searchParams;
  const result = await handleWebhook({
    signature: req.headers.get("x-signature"),
    requestId: req.headers.get("x-request-id"),
    dataId: sp.get("data.id") ?? (body.data?.id !== undefined ? String(body.data.id) : null),
    type: sp.get("type") ?? body.type ?? null,
    body,
  });
  return json({ ok: true, ...result });
});
