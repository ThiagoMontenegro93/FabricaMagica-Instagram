import { clientIp, json, readJson, route } from "@/server/http";
import { STAFF_ROLES, requireAuth } from "@/server/auth/session";
import { updateReservationStatus } from "@/server/services/reservation.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/** PATCH /api/reservations/:id/status — equipe muda o status; cliente só cancela a pendente. */
export const PATCH = route<Ctx>(async (req, { params }) => {
  const auth = await requireAuth(req, ["CLIENTE", ...STAFF_ROLES]);
  const reservation = await updateReservationStatus(auth.tid, { id: auth.sub, role: auth.role }, params.id, await readJson(req), clientIp(req));
  return json({ reservation });
});
