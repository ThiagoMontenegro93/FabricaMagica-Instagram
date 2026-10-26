import { prisma } from "@fabrica/db";
import {
  CharacterBlockSchema,
  LiveCharacterPatchSchema,
  LiveCharacterSchema,
  slugify,
} from "@fabrica/shared";
import { Errors } from "../errors";
import { audit } from "../audit";

const FIELDS = {
  id: true,
  slug: true,
  name: true,
  description: true,
  pricePer2h: true,
  priceExtraHour: true,
  photos: true,
  active: true,
} as const;

export async function listCharacters(tenantId: string, opts: { includeInactive?: boolean } = {}) {
  return prisma.liveCharacter.findMany({
    where: { tenantId, deletedAt: null, ...(opts.includeInactive ? {} : { active: true }) },
    select: FIELDS,
    orderBy: { name: "asc" },
  });
}

async function findOwned(tenantId: string, id: string) {
  const c = await prisma.liveCharacter.findFirst({ where: { id, tenantId, deletedAt: null }, select: { id: true, name: true } });
  if (!c) throw Errors.notFound("Personagem não encontrado");
  return c;
}

async function uniqueSlug(tenantId: string, name: string) {
  const base = slugify(name) || "personagem";
  for (let i = 1; i < 500; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    if (!(await prisma.liveCharacter.findFirst({ where: { tenantId, slug }, select: { id: true } }))) return slug;
  }
  throw Errors.conflict("Não foi possível gerar um endereço para este personagem");
}

export async function createCharacter(tenantId: string, actorId: string, input: unknown, ip?: string) {
  const data = LiveCharacterSchema.parse(input);
  const c = await prisma.liveCharacter.create({
    data: { ...data, tenantId, slug: await uniqueSlug(tenantId, data.name) },
    select: FIELDS,
  });
  await audit({ tenantId, action: "CHARACTER_CREATE", actorId, targetId: c.id, ip, metadata: { name: c.name } });
  return c;
}

export async function updateCharacter(tenantId: string, actorId: string, id: string, input: unknown, ip?: string) {
  const patch = LiveCharacterPatchSchema.parse(input);
  await findOwned(tenantId, id);
  const c = await prisma.liveCharacter.update({ where: { id }, data: patch, select: FIELDS });
  await audit({ tenantId, action: "CHARACTER_UPDATE", actorId, targetId: id, ip, metadata: { fields: Object.keys(patch) } });
  return c;
}

export async function deleteCharacter(tenantId: string, actorId: string, id: string, ip?: string) {
  const c = await findOwned(tenantId, id);
  const upcoming = await prisma.characterSchedule.count({
    where: { characterId: id, kind: "RESERVA", endsAt: { gte: new Date() } },
  });
  if (upcoming > 0) throw Errors.conflict(`Este personagem tem ${upcoming} festa(s) agendada(s). Desative em vez de excluir.`);
  await prisma.liveCharacter.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
  await audit({ tenantId, action: "CHARACTER_DELETE", actorId, targetId: id, ip, metadata: { name: c.name } });
}

/** RF10: agenda do personagem num intervalo (padrão: próximos 60 dias). */
export async function characterSchedule(tenantId: string, id: string, range: { from?: string | null; to?: string | null }) {
  await findOwned(tenantId, id);
  const from = range.from ? new Date(range.from) : new Date();
  const to = range.to ? new Date(range.to) : new Date(from.getTime() + 60 * 86_400_000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) throw Errors.badRequest("Intervalo inválido");
  return prisma.characterSchedule.findMany({
    where: { characterId: id, startsAt: { lt: to }, endsAt: { gt: from } },
    select: { id: true, kind: true, startsAt: true, endsAt: true, note: true, confirmedAt: true, reservationCharacterId: true },
    orderBy: { startsAt: "asc" },
  });
}

/**
 * RN03: bloqueio manual sem sobrepor festas ou outros bloqueios.
 * O advisory lock serializa escritas na agenda do mesmo personagem, então
 * dois atendentes não conseguem marcar o mesmo horário ao mesmo tempo.
 */
export async function blockCharacter(tenantId: string, actorId: string, id: string, input: unknown, ip?: string) {
  const data = CharacterBlockSchema.parse(input);
  await findOwned(tenantId, id);

  const block = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`character:${id}`}))`;
    const clash = await tx.characterSchedule.findFirst({
      where: { characterId: id, startsAt: { lt: data.endsAt }, endsAt: { gt: data.startsAt } },
      select: { kind: true, startsAt: true, endsAt: true },
    });
    if (clash) {
      throw Errors.conflict(
        clash.kind === "RESERVA" ? "Já existe uma festa neste horário." : "Já existe um bloqueio neste horário.",
      );
    }
    return tx.characterSchedule.create({
      data: { characterId: id, kind: "BLOQUEIO", startsAt: data.startsAt, endsAt: data.endsAt, note: data.note },
      select: { id: true, kind: true, startsAt: true, endsAt: true, note: true },
    });
  });

  await audit({ tenantId, action: "CHARACTER_BLOCK", actorId, targetId: id, ip, metadata: { blockId: block.id } });
  return block;
}

export async function unblockCharacter(tenantId: string, actorId: string, id: string, blockId: string, ip?: string) {
  await findOwned(tenantId, id);
  const { count } = await prisma.characterSchedule.deleteMany({ where: { id: blockId, characterId: id, kind: "BLOQUEIO" } });
  if (count === 0) throw Errors.notFound("Bloqueio não encontrado");
  await audit({ tenantId, action: "CHARACTER_UNBLOCK", actorId, targetId: id, ip, metadata: { blockId } });
}
