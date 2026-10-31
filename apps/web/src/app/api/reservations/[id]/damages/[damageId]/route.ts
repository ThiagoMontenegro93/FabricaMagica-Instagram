import { clientIp, json, route } from "@/server/http";
import { requireAuth } from "@/server/auth/session";
import { deleteDamage } from "@/server/services/damage.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string; damageId: string } };

/** DELETE /api/reservations/:id/damages/:damageId — só o dono desfaz (devolve a multa). */
export const DELETE = route<Ctx>(async (req, { params }) => {
  const auth = await requireAuth(req, ["SUPER_ADMIN"]);
  await deleteDamage(auth.tid, { id: auth.sub, role: auth.role }, params.id, params.damageId, clientIp(req));
  return json({ ok: true });
});
