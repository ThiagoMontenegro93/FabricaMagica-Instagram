import { clientIp, json, readJson, route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { currentTenant } from "@/server/tenant";
import { quoteReservation } from "@/server/services/reservation.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/reservations/quote — total e disponibilidade do carrinho, sem reservar (público). */
export const POST = route(async (req) => {
  rateLimit(`reservations:quote:${clientIp(req)}`, 120, 10 * 60_000);
  const tenant = await currentTenant();
  return json(await quoteReservation(tenant.id, await readJson(req)));
});
