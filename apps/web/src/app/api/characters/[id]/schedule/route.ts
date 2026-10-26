import { json, route } from "@/server/http";
import { STAFF_ROLES, requireAuth } from "@/server/auth/session";
import { characterSchedule } from "@/server/services/character.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/characters/:id/schedule?from=&to= — agenda (festas e bloqueios). */
export const GET = route<{ params: { id: string } }>(async (req, { params }) => {
  const auth = await requireAuth(req, STAFF_ROLES);
  const sp = req.nextUrl.searchParams;
  return json({ items: await characterSchedule(auth.tid, params.id, { from: sp.get("from"), to: sp.get("to") }) });
});
