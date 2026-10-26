import { clientIp, json, readJson, route } from "@/server/http";
import { requireAuth } from "@/server/auth/session";
import { deleteCharacter, updateCharacter } from "@/server/services/character.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export const PATCH = route<Ctx>(async (req, { params }) => {
  const auth = await requireAuth(req, ["SUPER_ADMIN"]);
  return json({ character: await updateCharacter(auth.tid, auth.sub, params.id, await readJson(req), clientIp(req)) });
});

export const DELETE = route<Ctx>(async (req, { params }) => {
  const auth = await requireAuth(req, ["SUPER_ADMIN"]);
  await deleteCharacter(auth.tid, auth.sub, params.id, clientIp(req));
  return json({ ok: true });
});
