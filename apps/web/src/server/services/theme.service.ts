import { prisma } from "@fabrica/db";
import {
  CatalogQuerySchema,
  PartyThemePatchSchema,
  PartyThemeSchema,
  availableThemeQty,
  slugify,
  type ReservationStatus,
  type Role,
  type StockReservation,
} from "@fabrica/shared";
import { Errors } from "../errors";
import { audit } from "../audit";

const PUBLIC_FIELDS = {
  id: true,
  slug: true,
  name: true,
  category: true,
  description: true,
  includedItems: true,
  sizeM2: true,
  dailyPrice: true,
  totalQty: true,
  weekendMultiplier: true,
  photos: true,
  status: true,
  isBestseller: true,
  isNew: true,
} as const;

/** Estados que podem ocupar estoque (o PENDENTE só enquanto o hold vale). */
const STOCK_STATUSES: ReservationStatus[] = ["PENDENTE", "PAGO", "EM_LOCACAO", "ATRASADO"];

const toIso = (d: Date) => d.toISOString().slice(0, 10);
const dateOnly = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/**
 * RF08 / RN02: quantidade disponível de cada tema no período.
 * Uma consulta só para todos os temas pedidos; a regra fica em @fabrica/shared.
 */
export async function themeAvailability(
  themes: { id: string; totalQty: number; status: string }[],
  period: { eventDate: string; returnDate: string },
  now = new Date(),
): Promise<Map<string, number>> {
  const rows = await prisma.reservationTheme.findMany({
    where: {
      themeId: { in: themes.map((t) => t.id) },
      reservation: {
        status: { in: STOCK_STATUSES },
        eventDate: { lte: dateOnly(period.returnDate) },
        returnDate: { gte: dateOnly(period.eventDate) },
      },
    },
    select: {
      themeId: true,
      quantity: true,
      reservation: { select: { status: true, eventDate: true, returnDate: true, holdExpiresAt: true } },
    },
  });

  const byTheme = new Map<string, StockReservation[]>();
  for (const r of rows) {
    const list = byTheme.get(r.themeId) ?? [];
    list.push({
      status: r.reservation.status,
      eventDate: toIso(r.reservation.eventDate),
      returnDate: toIso(r.reservation.returnDate),
      quantity: r.quantity,
      holdExpiresAt: r.reservation.holdExpiresAt,
    });
    byTheme.set(r.themeId, list);
  }

  return new Map(
    themes.map((t) => [
      t.id,
      t.status === "ATIVO" ? availableThemeQty(t.totalQty, byTheme.get(t.id) ?? [], period, now) : 0,
    ]),
  );
}

/** RF02 / RF14: catálogo com busca, categoria e disponibilidade na data. */
export async function listThemes(tenantId: string, rawQuery: unknown, opts: { includeHidden?: boolean } = {}) {
  const query = CatalogQuerySchema.parse(rawQuery);
  const themes = await prisma.partyTheme.findMany({
    where: {
      tenantId,
      deletedAt: null,
      ...(opts.includeHidden ? {} : { status: { in: ["ATIVO", "MANUTENCAO"] } }),
      ...(query.category ? { category: { equals: query.category, mode: "insensitive" as const } } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: "insensitive" as const } },
              { description: { contains: query.q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    select: { ...PUBLIC_FIELDS, createdAt: true },
    orderBy: [{ isBestseller: "desc" }, { name: "asc" }],
  });

  const categories = await prisma.partyTheme.groupBy({
    by: ["category"],
    where: { tenantId, deletedAt: null, ...(opts.includeHidden ? {} : { status: { in: ["ATIVO", "MANUTENCAO"] } }) },
    _count: true,
    orderBy: { category: "asc" },
  });

  let availability: Map<string, number> | null = null;
  if (query.availableOn) {
    const period = { eventDate: query.availableOn, returnDate: query.returnOn ?? query.availableOn };
    if (period.returnDate < period.eventDate) throw Errors.badRequest("Devolução antes do evento");
    availability = await themeAvailability(themes, period);
  }

  return {
    items: themes.map((t) => ({ ...t, availableQty: availability ? (availability.get(t.id) ?? 0) : null })),
    categories: categories.map((c) => ({ name: c.category, count: c._count })),
  };
}

export async function getTheme(tenantId: string, idOrSlug: string, opts: { includeHidden?: boolean } = {}) {
  const theme = await prisma.partyTheme.findFirst({
    where: {
      tenantId,
      deletedAt: null,
      OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      ...(opts.includeHidden ? {} : { status: { in: ["ATIVO", "MANUTENCAO"] } }),
    },
    select: PUBLIC_FIELDS,
  });
  if (!theme) throw Errors.notFound("Tema não encontrado");
  return theme;
}

/** Gera slug único: "harry-potter", "harry-potter-2"... */
async function uniqueSlug(tenantId: string, name: string, ignoreId?: string) {
  const base = slugify(name) || "tema";
  for (let i = 1; i < 500; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    const clash = await prisma.partyTheme.findFirst({
      where: { tenantId, slug, ...(ignoreId ? { NOT: { id: ignoreId } } : {}) },
      select: { id: true },
    });
    if (!clash) return slug;
  }
  throw Errors.conflict("Não foi possível gerar um endereço para este tema");
}

export async function createTheme(tenantId: string, actorId: string, input: unknown, ip?: string) {
  const data = PartyThemeSchema.parse(input);
  const theme = await prisma.partyTheme.create({
    data: { ...data, tenantId, slug: await uniqueSlug(tenantId, data.name) },
    select: PUBLIC_FIELDS,
  });
  await audit({ tenantId, action: "THEME_CREATE", actorId, targetId: theme.id, ip, metadata: { name: theme.name } });
  return theme;
}

/**
 * Dono edita tudo. Atendente só muda o status (ex.: bloquear para manutenção, RF08).
 * O slug não muda ao renomear, para não quebrar links já compartilhados.
 */
export async function updateTheme(
  tenantId: string,
  actor: { id: string; role: Role },
  id: string,
  input: unknown,
  ip?: string,
) {
  const patch = PartyThemePatchSchema.parse(input);
  if (actor.role !== "SUPER_ADMIN") {
    const keys = Object.keys(patch);
    if (keys.some((k) => k !== "status")) throw Errors.forbidden("Atendente só pode alterar o status do tema");
  }
  const current = await prisma.partyTheme.findFirst({ where: { id, tenantId, deletedAt: null }, select: { id: true } });
  if (!current) throw Errors.notFound("Tema não encontrado");

  const theme = await prisma.partyTheme.update({ where: { id }, data: patch, select: PUBLIC_FIELDS });
  await audit({ tenantId, action: "THEME_UPDATE", actorId: actor.id, targetId: id, ip, metadata: { fields: Object.keys(patch) } });
  return theme;
}

/** Exclusão lógica: some do catálogo, mas reservas antigas continuam apontando para ele. */
export async function deleteTheme(tenantId: string, actorId: string, id: string, ip?: string) {
  const theme = await prisma.partyTheme.findFirst({ where: { id, tenantId, deletedAt: null }, select: { id: true, name: true } });
  if (!theme) throw Errors.notFound("Tema não encontrado");

  const today = dateOnly(new Date().toISOString().slice(0, 10));
  const pending = await prisma.reservationTheme.count({
    where: { themeId: id, reservation: { status: { in: STOCK_STATUSES }, returnDate: { gte: today } } },
  });
  if (pending > 0) {
    throw Errors.conflict(`Este tema tem ${pending} reserva(s) em aberto. Coloque em manutenção ou aguarde a devolução.`);
  }

  await prisma.partyTheme.update({ where: { id }, data: { deletedAt: new Date(), status: "DESCONTINUADO" } });
  await audit({ tenantId, action: "THEME_DELETE", actorId, targetId: id, ip, metadata: { name: theme.name } });
}

