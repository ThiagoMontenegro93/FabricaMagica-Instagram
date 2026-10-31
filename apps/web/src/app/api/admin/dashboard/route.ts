import { json, route } from "@/server/http";
import { STAFF_ROLES, requireAuth } from "@/server/auth/session";
import { getDashboard } from "@/server/services/dashboard.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/dashboard — agenda do dia para a equipe; faturamento só para o dono. */
export const GET = route(async (req) => {
  const auth = await requireAuth(req, [...STAFF_ROLES]);
  return json(await getDashboard(auth.tid, auth.role), { headers: { "cache-control": "no-store" } });
});
