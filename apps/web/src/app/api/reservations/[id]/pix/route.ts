import { clientIp, json, route } from "@/server/http";
import { STAFF_ROLES, requireAuth } from "@/server/auth/session";
import { rateLimit } from "@/server/rate-limit";
import { createPix } from "@/server/services/payment.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/** POST /api/reservations/:id/pix — Pix com QR Code e copia-e-cola. */
export const POST = route<Ctx>(async (req, { params }) => {
  const auth = await requireAuth(req, ["CLIENTE", ...STAFF_ROLES]);
  rateLimit(`payments:${auth.sub}`, 30, 10 * 60_000);
  return json(await createPix(auth.tid, { id: auth.sub, role: auth.role }, params.id, clientIp(req)));
});
