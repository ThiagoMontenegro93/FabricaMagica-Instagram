import { NextResponse } from "next/server";
import { route } from "@/server/http";
import { STAFF_ROLES, requireAuth } from "@/server/auth/session";
import { readDocument } from "@/server/services/document.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/** GET /api/documents/:id/file?t= — abre o documento descriptografado. Nunca fica em cache. */
export const GET = route<Ctx>(async (req, { params }) => {
  const auth = await requireAuth(req, STAFF_ROLES);
  const doc = await readDocument(auth.tid, { id: auth.sub, role: auth.role }, params.id, req.nextUrl.searchParams.get("t"));
  return new NextResponse(new Uint8Array(doc.body), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": "inline",
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; object-src 'self'",
      "Referrer-Policy": "no-referrer",
    },
  });
});
