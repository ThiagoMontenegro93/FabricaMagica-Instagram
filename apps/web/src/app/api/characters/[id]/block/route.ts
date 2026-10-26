import { clientIp, json, readJson, route } from "@/server/http";
import { STAFF_ROLES, requireAuth } from "@/server/auth/session";
import { blockCharacter } from "@/server/services/character.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/characters/:id/block — bloqueia um horário da agenda (RN03). */
export const POST = route<{ params: { id: string } }>(async (req, { params }) => {
  const auth = await requireAuth(req, STAFF_ROLES);
  return json({ block: await blockCharacter(auth.tid, auth.sub, params.id, await readJson(req), clientIp(req)) }, { status: 201 });
});
