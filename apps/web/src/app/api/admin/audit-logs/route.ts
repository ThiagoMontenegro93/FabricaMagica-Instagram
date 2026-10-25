import { json, route } from "@/server/http";
import { requireAuth } from "@/server/auth/session";
import { listAuditLogs } from "@/server/services/settings.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/audit-logs?action=ACCESS_DOC — só o dono vê os logs (RF12). */
export const GET = route(async (req) => {
  const auth = await requireAuth(req, ["SUPER_ADMIN"]);
  const sp = req.nextUrl.searchParams;
  const take = sp.get("take") ? Number(sp.get("take")) : undefined;
  return json(
    await listAuditLogs(auth.tid, {
      action: sp.get("action") ?? undefined,
      cursor: sp.get("cursor") ?? undefined,
      take: Number.isFinite(take) ? take : undefined,
    }),
  );
});
