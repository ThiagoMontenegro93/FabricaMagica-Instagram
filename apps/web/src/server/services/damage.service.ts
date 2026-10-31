import { prisma } from "@fabrica/db";
import { DamageReportSchema, type Role } from "@fabrica/shared";
import { Errors } from "../errors";
import { audit } from "../audit";

type Actor = { id: string; role: Role };

/** Só faz sentido registrar avaria depois que o tema saiu da loja. */
const DAMAGE_STATUSES = ["EM_LOCACAO", "ATRASADO", "DEVOLVIDO"] as const;

const DAMAGE_SELECT = {
  id: true,
  note: true,
  fee: true,
  photos: true,
  createdAt: true,
  theme: { select: { id: true, name: true } },
} as const;

async function findReservation(tenantId: string, idOrCode: string) {
  const r = await prisma.reservation.findFirst({
    where: { tenantId, OR: [{ id: idOrCode }, { code: idOrCode.toUpperCase() }] },
    select: { id: true, code: true, status: true, themes: { select: { themeId: true } } },
  });
  if (!r) throw Errors.notFound("Reserva não encontrada");
  return r;
}

export async function listDamages(tenantId: string, reservationId: string) {
  const r = await findReservation(tenantId, reservationId);
  return prisma.damageReport.findMany({ where: { reservationId: r.id }, select: DAMAGE_SELECT, orderBy: { createdAt: "asc" } });
}

/** Registra a avaria e soma a multa no total da reserva, numa transação. */
export async function addDamage(tenantId: string, actor: Actor, reservationId: string, input: unknown, ip?: string) {
  const data = DamageReportSchema.parse(input);
  const r = await findReservation(tenantId, reservationId);
  if (!(DAMAGE_STATUSES as readonly string[]).includes(r.status)) {
    throw Errors.conflict("Registre a avaria quando o tema voltar (em locação, atrasado ou devolvido)");
  }
  if (data.themeId && !r.themes.some((t) => t.themeId === data.themeId)) {
    throw Errors.badRequest("Esse tema não faz parte da reserva");
  }

  const damage = await prisma.$transaction(async (tx) => {
    const created = await tx.damageReport.create({
      data: { reservationId: r.id, themeId: data.themeId, note: data.note, fee: data.fee, photos: data.photos, createdById: actor.id },
      select: DAMAGE_SELECT,
    });
    if (data.fee > 0) {
      await tx.reservation.update({
        where: { id: r.id },
        data: { damageFee: { increment: data.fee }, totalPrice: { increment: data.fee } },
      });
    }
    return created;
  });

  await audit({ tenantId, action: "DAMAGE_REPORT", actorId: actor.id, targetId: r.id, ip, metadata: { damageId: damage.id, fee: data.fee } });
  return damage;
}

/** Só o dono desfaz uma avaria (devolve a multa ao total). */
export async function deleteDamage(tenantId: string, actor: Actor, reservationId: string, damageId: string, ip?: string) {
  if (actor.role !== "SUPER_ADMIN") throw Errors.forbidden("Só o dono remove avarias");
  const r = await findReservation(tenantId, reservationId);
  await prisma.$transaction(async (tx) => {
    const d = await tx.damageReport.findFirst({ where: { id: damageId, reservationId: r.id }, select: { fee: true } });
    if (!d) throw Errors.notFound("Avaria não encontrada");
    await tx.damageReport.delete({ where: { id: damageId } });
    if (d.fee > 0) {
      await tx.reservation.update({
        where: { id: r.id },
        data: { damageFee: { decrement: d.fee }, totalPrice: { decrement: d.fee } },
      });
    }
  });
  await audit({ tenantId, action: "DAMAGE_DELETE", actorId: actor.id, targetId: r.id, ip, metadata: { damageId } });
}
