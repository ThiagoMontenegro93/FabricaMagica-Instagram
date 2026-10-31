import { timingSafeEqual } from "node:crypto";
import { prisma } from "@fabrica/db";
import { json, route } from "@/server/http";
import { env } from "@/server/env";
import { Errors } from "@/server/errors";
import { log } from "@/server/logger";
import { purgeExpiredDocuments } from "@/server/services/document.service";
import { refreshStatuses } from "@/server/services/reservation.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cron/rotina — chamado por um agendador (cron do Railway/Render, a cada hora).
 * Header: Authorization: Bearer <CRON_SECRET>.
 * Vence reservas sem pagamento, marca atrasos e apaga documentos fora do prazo de retenção.
 */
export const POST = route(async (req) => {
  const secret = env().CRON_SECRET;
  const given = Buffer.from(req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "");
  if (!secret || given.length !== Buffer.byteLength(secret) || !timingSafeEqual(given, Buffer.from(secret))) {
    throw Errors.unauthorized("Não autorizado");
  }
  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  for (const t of tenants) await refreshStatuses(t.id);
  const purged = await purgeExpiredDocuments();
  log("info", { action: "CRON_ROTINA", tenants: tenants.length, purged });
  return json({ ok: true, tenants: tenants.length, purgedDocuments: purged });
});
