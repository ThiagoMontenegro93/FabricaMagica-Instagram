import { clientIp, json, readJson, route } from "@/server/http";
import { STAFF_ROLES, requireAuth } from "@/server/auth/session";
import { addDamage, listDamages } from "@/server/services/damage.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/** GET /api/reservations/:id/damages — avarias registradas (equipe). */
export const GET = route<Ctx>(async (req, { params }) => {
  const auth = await requireAuth(req, [...STAFF_ROLES]);
  return json({ items: await listDamages(auth.tid, params.id) });
});

/** POST /api/reservations/:id/damages — registra avaria na volta e soma a multa ao total. */
export const POST = route<Ctx>(async (req, { params }) => {
  const auth = await requireAuth(req, [...STAFF_ROLES]);
  const damage = await addDamage(auth.tid, { id: auth.sub, role: auth.role }, params.id, await readJson(req), clientIp(req));
  return json({ damage }, { status: 201 });
});
