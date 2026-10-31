import { clientIp, json, route } from "@/server/http";
import { STAFF_ROLES, requireAuth } from "@/server/auth/session";
import { documentLink } from "@/server/services/document.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/** POST /api/documents/:id/link — link de 15 min para a equipe ver o documento (auditado). */
export const POST = route<Ctx>(async (req, { params }) => {
  const auth = await requireAuth(req, STAFF_ROLES);
  return json(await documentLink(auth.tid, { id: auth.sub, role: auth.role }, params.id, clientIp(req)));
});
