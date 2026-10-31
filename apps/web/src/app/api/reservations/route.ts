import { clientIp, json, readJson, route } from "@/server/http";
import { STAFF_ROLES, requireAuth } from "@/server/auth/session";
import { rateLimit } from "@/server/rate-limit";
import { createReservation, listMyReservations, listReservations } from "@/server/services/reservation.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/reservations — cria reserva PENDENTE (cliente) ou manual (equipe, com clientId). */
export const POST = route(async (req) => {
  const auth = await requireAuth(req, ["CLIENTE", ...STAFF_ROLES]);
  rateLimit(`reservations:create:${auth.sub}`, 20, 60 * 60_000);
  const reservation = await createReservation(auth.tid, { id: auth.sub, role: auth.role }, await readJson(req), clientIp(req));
  return json({ reservation }, { status: 201 });
});

/** GET /api/reservations — cliente: as próprias; equipe: todas, com filtros. */
export const GET = route(async (req) => {
  const auth = await requireAuth(req);
  if (auth.role === "CLIENTE") return json({ items: await listMyReservations(auth.tid, auth.sub), nextCursor: null });
  if (auth.role === "PERSONAGEM") return json({ items: [], nextCursor: null });
  return json(await listReservations(auth.tid, Object.fromEntries(req.nextUrl.searchParams)));
});
