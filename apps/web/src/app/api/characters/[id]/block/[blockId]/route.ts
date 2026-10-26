import { clientIp, json, route } from "@/server/http";
import { STAFF_ROLES, requireAuth } from "@/server/auth/session";
import { unblockCharacter } from "@/server/services/character.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = route<{ params: { id: string; blockId: string } }>(async (req, { params }) => {
  const auth = await requireAuth(req, STAFF_ROLES);
  await unblockCharacter(auth.tid, auth.sub, params.id, params.blockId, clientIp(req));
  return json({ ok: true });
});
