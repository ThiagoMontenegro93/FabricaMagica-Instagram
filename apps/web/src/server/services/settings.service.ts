import { prisma } from "@fabrica/db";
import { FABRICA_MAGICA, TenantSettingsPatchSchema, whatsappLink } from "@fabrica/shared";
import { audit } from "../audit";

const SETTINGS_FIELDS = {
  hostSensitiveDocs: true,
  retentionDays: true,
  requireProof: true,
  requireSelfie: true,
  blockWithoutDocs: true,
  weekendMultiplier: true,
  deliveryFeeBase: true,
  updatedAt: true,
} as const;

export async function getSettings(tenantId: string) {
  return prisma.tenantSettings.findUniqueOrThrow({ where: { tenantId }, select: SETTINGS_FIELDS });
}

/** O que o site público precisa saber para montar o cadastro (sem expor o resto). */
export async function getPublicSettings(tenantId: string) {
  const [settings, tenant] = await Promise.all([
    prisma.tenantSettings.findUniqueOrThrow({
      where: { tenantId },
      select: { hostSensitiveDocs: true, requireProof: true, requireSelfie: true, deliveryFeeBase: true },
    }),
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true, whatsapp: true } }),
  ]);
  return {
    name: tenant.name,
    whatsapp: tenant.whatsapp,
    whatsappLink: whatsappLink(undefined, tenant.whatsapp),
    slogan: FABRICA_MAGICA.slogan,
    deliveryFee: settings.deliveryFeeBase,
    documents: settings.hostSensitiveDocs
      ? { mode: "UPLOAD" as const, requireProof: settings.requireProof, requireSelfie: settings.requireSelfie }
      : { mode: "WHATSAPP" as const },
  };
}

/** RF12: só o SUPER_ADMIN chega aqui (checado na rota). Toda mudança vai para o AuditLog com antes/depois. */
export async function updateSettings(tenantId: string, actorId: string, input: unknown, ip?: string) {
  const patch = TenantSettingsPatchSchema.parse(input);
  const before = await getSettings(tenantId);
  const after = await prisma.tenantSettings.update({ where: { tenantId }, data: patch, select: SETTINGS_FIELDS });

  const changed = Object.fromEntries(
    Object.keys(patch)
      .filter((k) => before[k as keyof typeof before] !== after[k as keyof typeof after])
      .map((k) => [k, { from: before[k as keyof typeof before], to: after[k as keyof typeof after] }]),
  );
  if (Object.keys(changed).length > 0) {
    await audit({
      tenantId,
      action: "UPDATE_SETTINGS",
      actorId,
      targetId: tenantId,
      ip,
      metadata: JSON.parse(JSON.stringify(changed)),
    });
  }
  return after;
}

export async function listAuditLogs(tenantId: string, opts: { action?: string; take?: number; cursor?: string }) {
  const take = Math.min(Math.max(opts.take ?? 50, 1), 100);
  const rows = await prisma.auditLog.findMany({
    where: { tenantId, ...(opts.action ? { action: opts.action } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > take;
  const items = hasMore ? rows.slice(0, take) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1]?.id : null };
}
