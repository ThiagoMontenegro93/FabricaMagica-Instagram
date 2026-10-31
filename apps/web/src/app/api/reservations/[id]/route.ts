import { json, route } from "@/server/http";
import { requireAuth } from "@/server/auth/session";
import { getReservation } from "@/server/services/reservation.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/** GET /api/reservations/:id-ou-código — dono da reserva ou equipe. */
export const GET = route<Ctx>(async (req, { params }) => {
  const auth = await requireAuth(req);
  return json({ reservation: await getReservation(auth.tid, { id: auth.sub, role: auth.role }, params.id) });
});
