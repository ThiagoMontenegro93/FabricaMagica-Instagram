import { clientIp, json, readJson, route } from "@/server/http";
import { STAFF_ROLES, requireAuth } from "@/server/auth/session";
import { isStaff } from "@/server/auth/optional";
import { currentTenant } from "@/server/tenant";
import { deleteTheme, getTheme, updateTheme } from "@/server/services/theme.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/** GET /api/themes/:idOuSlug */
export const GET = route<Ctx>(async (req, { params }) => {
  const tenant = await currentTenant();
  return json({ theme: await getTheme(tenant.id, params.id, { includeHidden: await isStaff(req) }) });
});

/** PATCH /api/themes/:id — dono edita tudo; atendente só o status (manutenção). */
export const PATCH = route<Ctx>(async (req, { params }) => {
  const auth = await requireAuth(req, STAFF_ROLES);
  const theme = await updateTheme(auth.tid, { id: auth.sub, role: auth.role }, params.id, await readJson(req), clientIp(req));
  return json({ theme });
});

/** DELETE /api/themes/:id — exclusão lógica, bloqueada se houver reserva em aberto. */
export const DELETE = route<Ctx>(async (req, { params }) => {
  const auth = await requireAuth(req, ["SUPER_ADMIN"]);
  await deleteTheme(auth.tid, auth.sub, params.id, clientIp(req));
  return json({ ok: true });
});
