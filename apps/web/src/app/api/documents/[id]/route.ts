import { clientIp, json, route } from "@/server/http";
import { requireAuth } from "@/server/auth/session";
import { deleteMyDocument } from "@/server/services/document.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/** DELETE /api/documents/:id — o cliente apaga o próprio documento (LGPD). */
export const DELETE = route<Ctx>(async (req, { params }) => {
  const auth = await requireAuth(req, ["CLIENTE"]);
  await deleteMyDocument(auth.tid, { id: auth.sub, role: auth.role }, params.id, clientIp(req));
  return json({ ok: true });
});
