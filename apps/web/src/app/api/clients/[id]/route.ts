import { clientIp, json, route } from "@/server/http";
import { STAFF_ROLES, requireAuth } from "@/server/auth/session";
import { getClientDetail } from "@/server/services/client.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/** GET /api/clients/:id — ficha do cliente para a equipe (CPF mascarado para atendente, auditado). */
export const GET = route<Ctx>(async (req, { params }) => {
  const auth = await requireAuth(req, STAFF_ROLES);
  return json(await getClientDetail(auth.tid, { id: auth.sub, role: auth.role }, params.id, clientIp(req)));
});
