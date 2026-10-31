import { z } from "zod";
import { clientIp, json, readJson, route } from "@/server/http";
import { STAFF_ROLES, requireAuth } from "@/server/auth/session";
import { setDocsVerified } from "@/server/services/document.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/** PATCH /api/clients/:id/verify-docs { verified } — equipe confirma os documentos. */
export const PATCH = route<Ctx>(async (req, { params }) => {
  const auth = await requireAuth(req, STAFF_ROLES);
  const { verified } = z.object({ verified: z.boolean() }).parse(await readJson(req));
  return json(await setDocsVerified(auth.tid, { id: auth.sub, role: auth.role }, params.id, verified, clientIp(req)));
});
