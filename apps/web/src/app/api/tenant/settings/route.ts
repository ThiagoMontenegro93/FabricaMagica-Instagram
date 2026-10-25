import { clientIp, json, readJson, route } from "@/server/http";
import { STAFF_ROLES, requireAuth } from "@/server/auth/session";
import { getSettings, updateSettings } from "@/server/services/settings.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/tenant/settings — equipe vê as configurações. */
export const GET = route(async (req) => {
  const auth = await requireAuth(req, STAFF_ROLES);
  return json({ settings: await getSettings(auth.tid) });
});

/** PATCH /api/tenant/settings — só o dono altera privacidade e taxas (RF12). */
export const PATCH = route(async (req) => {
  const auth = await requireAuth(req, ["SUPER_ADMIN"]);
  const settings = await updateSettings(auth.tid, auth.sub, await readJson(req), clientIp(req));
  return json({ settings });
});
