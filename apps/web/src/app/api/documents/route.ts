import { clientIp, json, route } from "@/server/http";
import { requireAuth } from "@/server/auth/session";
import { rateLimit } from "@/server/rate-limit";
import { Errors } from "@/server/errors";
import { myDocumentStatus, uploadDocument } from "@/server/services/document.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/documents — o que o cliente precisa enviar e o que já enviou (sem conteúdo). */
export const GET = route(async (req) => {
  const auth = await requireAuth(req, ["CLIENTE"]);
  return json(await myDocumentStatus(auth.tid, auth.sub));
});

/** POST /api/documents (multipart: kind, file) — upload criptografado, só com hostSensitiveDocs ligado. */
export const POST = route(async (req) => {
  const auth = await requireAuth(req, ["CLIENTE"]);
  rateLimit(`documents:upload:${auth.sub}`, 20, 60 * 60_000);
  const form = await req.formData().catch(() => {
    throw Errors.badRequest("Envie o arquivo como formulário (multipart)");
  });
  const document = await uploadDocument(auth.tid, { id: auth.sub, role: auth.role }, form, clientIp(req));
  return json({ document }, { status: 201 });
});
