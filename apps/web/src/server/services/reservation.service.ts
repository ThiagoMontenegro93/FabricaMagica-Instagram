import { randomBytes } from "node:crypto";
import { Prisma, prisma } from "@fabrica/db";
import {
  PENDING_HOLD_MINUTES,
  ReservationListQuerySchema,
  ReservationRequestSchema,
  ReservationStatusPatchSchema,
  STORE_UTC_OFFSET,
  addMinutes,
  calculateQuote,
  canTransition,
  characterDurationMinutes,
  characterPrice,
  isLate,
  lateDays,
  reservationCode,
  resolveOffer,
  storeDateOf,
  todayInStore,
  type Address,
  type ReservationRequest,
  type ReservationStatus,
  type Role,
} from "@fabrica/shared";
import { Errors } from "../errors";
import { audit } from "../audit";
import { offerDefaults, themeAvailability } from "./theme.service";

type Db = Prisma.TransactionClient;
type Actor = { id: string; role: Role };

const toIso = (d: Date) => d.toISOString().slice(0, 10);
const dateOnly = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const isStaff = (role: Role) => role === "SUPER_ADMIN" || role === "ATENDENTE";

export const RESERVATION_DETAIL = {
  id: true,
  code: true,
  status: true,
  dealType: true,
  deliveryType: true,
  deliveryAddress: true,
  eventDate: true,
  returnDate: true,
  subtotal: true,
  weekendFee: true,
  deliveryFee: true,
  lateFee: true,
  damageFee: true,
  totalPrice: true,
  holdExpiresAt: true,
  paidAt: true,
  deliveredAt: true,
  returnedAt: true,
  cancelledAt: true,
  pixQrCode: true,
  createdAt: true,
  client: { select: { id: true, name: true, whatsapp: true, email: true, userId: true } },
  themes: {
    select: {
      id: true,
      quantity: true,
      unitPrice: true,
      weekendFee: true,
      theme: { select: { id: true, name: true, slug: true, photos: true } },
    },
  },
  characters: {
    select: {
      id: true,
      startsAt: true,
      extraHours: true,
      price: true,
      character: { select: { id: true, name: true } },
    },
    orderBy: { startsAt: "asc" as const },
  },
} satisfies Prisma.ReservationSelect;

type ReservationRow = Prisma.ReservationGetPayload<{ select: typeof RESERVATION_DETAIL }>;

/** Datas como "YYYY-MM-DD" e sem o userId do cliente (só serve para checar dono). */
function present(r: ReservationRow) {
  const { userId: _userId, ...client } = r.client;
  return { ...r, client, eventDate: toIso(r.eventDate), returnDate: toIso(r.returnDate) };
}
export type ReservationView = ReturnType<typeof present>;

// --- Liberação de estoque ----------------------------------------------------

/** Devolve o que a reserva segurava: horário dos personagens e unidades de venda. */
async function release(db: Db, reservationId: string) {
  const r = await db.reservation.findUniqueOrThrow({
    where: { id: reservationId },
    select: { dealType: true, themes: { select: { themeId: true, quantity: true } } },
  });
  await db.characterSchedule.deleteMany({ where: { reservationCharacter: { reservationId } } });
  if (r.dealType === "VENDA") {
    for (const t of r.themes) {
      await db.partyTheme.update({ where: { id: t.themeId }, data: { saleQty: { increment: t.quantity } } });
    }
  }
}

/**
 * Reservas PENDENTE com hold vencido viram CANCELADO e liberam estoque.
 * O updateMany com status PENDENTE garante que só uma chamada libera cada reserva.
 */
export async function expireHolds(db: Db, tenantId: string, now = new Date()) {
  const expired = await db.reservation.findMany({
    where: { tenantId, status: "PENDENTE", holdExpiresAt: { lt: now } },
    select: { id: true },
  });
  for (const { id } of expired) {
    const { count } = await db.reservation.updateMany({
      where: { id, status: "PENDENTE" },
      data: { status: "CANCELADO", cancelledAt: now, holdExpiresAt: null },
    });
    if (count === 1) await release(db, id);
  }
  return expired.length;
}

/** RN08: aluguel entregue e não devolvido depois de returnDate + 24h vira ATRASADO. */
async function markLate(db: Db, tenantId: string, now = new Date()) {
  const open = await db.reservation.findMany({
    where: { tenantId, status: "EM_LOCACAO", dealType: "ALUGUEL", returnDate: { lt: dateOnly(todayInStore(now)) } },
    select: { id: true, returnDate: true },
  });
  const late = open.filter((r) => isLate("EM_LOCACAO", new Date(`${toIso(r.returnDate)}T23:59:59${STORE_UTC_OFFSET}`), now));
  if (late.length > 0) {
    await db.reservation.updateMany({ where: { id: { in: late.map((r) => r.id) }, status: "EM_LOCACAO" }, data: { status: "ATRASADO" } });
  }
}

/** Atualiza status que dependem do relógio. Chamado antes de listar e no painel. */
export async function refreshStatuses(tenantId: string, now = new Date()) {
  await prisma.$transaction(async (tx) => {
    await expireHolds(tx, tenantId, now);
    await markLate(tx, tenantId, now);
  });
}

// --- Montagem do pedido -------------------------------------------------------

interface Prepared {
  data: ReservationRequest & { returnDate: string };
  quote: ReturnType<typeof calculateQuote>;
  themeLines: { themeId: string; name: string; quantity: number; unitPrice: number; weekendFee: number }[];
  characterLines: { characterId: string; name: string; startsAt: Date; endsAt: Date; extraHours: number; price: number }[];
  unavailable: string[];
}

/**
 * Valida o pedido e calcula o total com as regras da loja.
 * Não grava nada: serve para a cotação e, dentro da transação com locks, para a reserva.
 */
async function prepare(db: Db, tenantId: string, input: unknown, now: Date): Promise<Prepared> {
  const parsed = ReservationRequestSchema.parse(input);
  const data = { ...parsed, returnDate: parsed.dealType === "VENDA" ? parsed.eventDate : (parsed.returnDate ?? parsed.eventDate) };
  if (data.eventDate < todayInStore(now)) throw Errors.badRequest("Escolha uma data a partir de hoje");

  const [settings, defaults] = await Promise.all([
    db.tenantSettings.findUniqueOrThrow({ where: { tenantId }, select: { weekendMultiplier: true } }),
    offerDefaults(tenantId),
  ]);

  const themes = await db.partyTheme.findMany({
    where: { tenantId, deletedAt: null, id: { in: data.themes.map((t) => t.themeId) } },
  });
  if (themes.length !== data.themes.length) throw Errors.badRequest("Um dos temas não existe mais. Atualize o carrinho.");

  const unavailable: string[] = [];
  let deliveryFee = 0;
  const period = { eventDate: data.eventDate, returnDate: data.returnDate };
  const rentAvailability =
    data.dealType === "ALUGUEL" ? await themeAvailability(themes, period, now, db) : new Map<string, number>();

  const themeLines = data.themes.map((line) => {
    const theme = themes.find((t) => t.id === line.themeId)!;
    const offer = resolveOffer(theme, defaults);
    if (!offer.deals.includes(data.dealType)) {
      throw Errors.badRequest(`${theme.name} não está disponível para ${data.dealType === "VENDA" ? "venda" : "aluguel"}`);
    }
    if (!offer.deliveryTypes.includes(data.deliveryType)) {
      throw Errors.badRequest(
        `${theme.name} só pode ser ${data.deliveryType === "ENTREGA" ? "retirado na loja" : "entregue pela loja"}`,
      );
    }
    const free = data.dealType === "VENDA" ? theme.saleQty : (rentAvailability.get(theme.id) ?? 0);
    if (theme.status !== "ATIVO" || free < line.quantity) unavailable.push(theme.name);
    // Um frete por pedido: vale o maior entre os temas (uma viagem só).
    if (data.deliveryType === "ENTREGA") deliveryFee = Math.max(deliveryFee, offer.deliveryFee);

    const one = calculateQuote({
      eventDate: data.eventDate,
      themes: [{ dailyPrice: theme.dailyPrice, quantity: line.quantity, weekendMultiplier: theme.weekendMultiplier, salePrice: theme.salePrice }],
      characters: [],
      deliveryFee: 0,
      tenantWeekendMultiplier: settings.weekendMultiplier,
      dealType: data.dealType,
      deliveryType: data.deliveryType,
    });
    return {
      themeId: theme.id,
      name: theme.name,
      quantity: line.quantity,
      unitPrice: data.dealType === "VENDA" ? theme.salePrice! : theme.dailyPrice,
      weekendFee: one.weekendFee,
    };
  });

  const characters = await db.liveCharacter.findMany({
    where: { tenantId, deletedAt: null, active: true, id: { in: data.characters.map((c) => c.characterId) } },
  });
  const characterLines = data.characters.map((line) => {
    const c = characters.find((x) => x.id === line.characterId);
    if (!c) throw Errors.badRequest("Um dos personagens não está mais disponível. Atualize o carrinho.");
    const day = storeDateOf(line.startsAt);
    if (day < data.eventDate || day > data.returnDate) {
      throw Errors.badRequest(`O horário de ${c.name} precisa ser no dia da festa`);
    }
    if (line.startsAt < now) throw Errors.badRequest(`O horário de ${c.name} já passou`);
    return {
      characterId: c.id,
      name: c.name,
      startsAt: line.startsAt,
      endsAt: addMinutes(line.startsAt, characterDurationMinutes(line.extraHours)),
      extraHours: line.extraHours,
      price: characterPrice({ pricePer2h: c.pricePer2h, priceExtraHour: c.priceExtraHour, extraHours: line.extraHours }),
    };
  });

  // RN03: dois horários do mesmo personagem no pedido, ou já ocupado na agenda.
  for (const [i, a] of characterLines.entries()) {
    const sameOrder = characterLines.some((b, j) => j !== i && b.characterId === a.characterId && a.startsAt < b.endsAt && b.startsAt < a.endsAt);
    const clash = await db.characterSchedule.findFirst({
      where: { characterId: a.characterId, startsAt: { lt: a.endsAt }, endsAt: { gt: a.startsAt } },
      select: { id: true },
    });
    if ((sameOrder || clash) && !unavailable.includes(a.name)) unavailable.push(a.name);
  }

  const quote = calculateQuote({
    eventDate: data.eventDate,
    themes: themes.length
      ? data.themes.map((line) => {
          const t = themes.find((x) => x.id === line.themeId)!;
          return { dailyPrice: t.dailyPrice, quantity: line.quantity, weekendMultiplier: t.weekendMultiplier, salePrice: t.salePrice };
        })
      : [],
    characters: data.characters.map((line) => {
      const c = characters.find((x) => x.id === line.characterId)!;
      return { pricePer2h: c.pricePer2h, priceExtraHour: c.priceExtraHour, extraHours: line.extraHours };
    }),
    deliveryFee,
    tenantWeekendMultiplier: settings.weekendMultiplier,
    dealType: data.dealType,
    deliveryType: themes.length ? data.deliveryType : "RETIRADA",
  });

  return { data, quote, themeLines, characterLines, unavailable };
}

/** POST /api/reservations/quote: total e disponibilidade, sem reservar. */
export async function quoteReservation(tenantId: string, input: unknown, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    await expireHolds(tx, tenantId, now);
    const p = await prepare(tx, tenantId, input, now);
    return {
      quote: p.quote,
      themes: p.themeLines,
      characters: p.characterLines.map(({ endsAt: _e, ...c }) => c),
      unavailable: p.unavailable,
      returnDate: p.data.returnDate,
    };
  });
}

async function newCode(db: Db): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = reservationCode((n) => randomBytes(n));
    if (!(await db.reservation.findUnique({ where: { code }, select: { id: true } }))) return code;
  }
  throw Errors.conflict("Tente novamente em instantes");
}

function asAddress(v: Prisma.JsonValue | null | undefined): Address | null {
  return v && typeof v === "object" && !Array.isArray(v) && "cep" in v ? (v as unknown as Address) : null;
}

/**
 * RF04 / RN02 / RN03: cria a reserva PENDENTE e segura o estoque por 30 min.
 * Os advisory locks (por tema e por personagem, sempre na mesma ordem) fazem
 * dois pedidos simultâneos do último kit serem atendidos um de cada vez.
 */
export async function createReservation(tenantId: string, actor: Actor, input: unknown, ip?: string, now = new Date()) {
  const body = (input ?? {}) as { clientId?: unknown };
  let clientId: string;
  if (isStaff(actor.role)) {
    if (typeof body.clientId !== "string") throw Errors.badRequest("Escolha o cliente da reserva");
    clientId = body.clientId;
  } else {
    if (body.clientId !== undefined) throw Errors.forbidden();
    const own = await prisma.client.findFirst({ where: { tenantId, userId: actor.id, deletedAt: null }, select: { id: true } });
    if (!own) throw Errors.conflict("Complete seu cadastro de locação antes de reservar.");
    clientId = own.id;
  }
  const client = await prisma.client.findFirst({
    where: { id: clientId, tenantId, deletedAt: null },
    select: { id: true, address: true, partyAddress: true },
  });
  if (!client) throw Errors.notFound("Cliente não encontrado");

  const reservation = await prisma.$transaction(async (tx) => {
    const parsed = ReservationRequestSchema.parse(input);
    const keys = [
      ...parsed.themes.map((t) => `theme:${t.themeId}`),
      ...parsed.characters.map((c) => `character:${c.characterId}`),
    ].sort();
    for (const key of new Set(keys)) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;

    await expireHolds(tx, tenantId, now);
    const p = await prepare(tx, tenantId, input, now);
    if (p.unavailable.length > 0) {
      throw Errors.conflict(`Indisponível na data: ${p.unavailable.join(", ")}. Escolha outra data ou horário.`);
    }

    const hasThemes = p.themeLines.length > 0;
    const address =
      hasThemes && p.data.deliveryType === "ENTREGA"
        ? (p.data.deliveryAddress ?? asAddress(client.partyAddress) ?? asAddress(client.address))
        : null;
    if (hasThemes && p.data.deliveryType === "ENTREGA" && !address) throw Errors.badRequest("Informe o endereço de entrega");

    const created = await tx.reservation.create({
      data: {
        tenantId,
        clientId: client.id,
        code: await newCode(tx),
        eventDate: dateOnly(p.data.eventDate),
        returnDate: dateOnly(p.data.returnDate),
        dealType: p.data.dealType,
        deliveryType: hasThemes ? p.data.deliveryType : "RETIRADA",
        deliveryAddress: address ? (address as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        subtotal: p.quote.subtotal,
        weekendFee: p.quote.weekendFee,
        deliveryFee: p.quote.deliveryFee,
        totalPrice: p.quote.total,
        holdExpiresAt: addMinutes(now, PENDING_HOLD_MINUTES),
        createdById: isStaff(actor.role) ? actor.id : null,
        themes: {
          create: p.themeLines.map((t) => ({ themeId: t.themeId, quantity: t.quantity, unitPrice: t.unitPrice, weekendFee: t.weekendFee })),
        },
      },
      select: { id: true },
    });

    for (const c of p.characterLines) {
      await tx.reservationCharacter.create({
        data: {
          reservationId: created.id,
          characterId: c.characterId,
          startsAt: c.startsAt,
          extraHours: c.extraHours,
          price: c.price,
          schedule: { create: { characterId: c.characterId, kind: "RESERVA", startsAt: c.startsAt, endsAt: c.endsAt } },
        },
      });
    }

    if (p.data.dealType === "VENDA") {
      for (const t of p.themeLines) {
        await tx.partyTheme.update({ where: { id: t.themeId }, data: { saleQty: { decrement: t.quantity } } });
      }
    }

    return tx.reservation.findUniqueOrThrow({ where: { id: created.id }, select: RESERVATION_DETAIL });
  });

  await audit({
    tenantId,
    action: "RESERVATION_CREATE",
    actorId: actor.id,
    targetId: reservation.id,
    ip,
    metadata: { code: reservation.code, total: reservation.totalPrice, manual: isStaff(actor.role) },
  });
  return present(reservation);
}

// --- Consulta -----------------------------------------------------------------

/** Cliente vê só as próprias reservas; equipe vê todas do tenant. */
export async function getReservation(tenantId: string, actor: Actor, idOrCode: string) {
  await refreshStatuses(tenantId);
  const r = await prisma.reservation.findFirst({
    where: { tenantId, OR: [{ id: idOrCode }, { code: idOrCode.toUpperCase() }] },
    select: RESERVATION_DETAIL,
  });
  if (!r || (!isStaff(actor.role) && r.client.userId !== actor.id)) throw Errors.notFound("Reserva não encontrada");
  return present(r);
}

export async function listMyReservations(tenantId: string, userId: string) {
  await refreshStatuses(tenantId);
  const rows = await prisma.reservation.findMany({
    where: { tenantId, client: { userId } },
    select: RESERVATION_DETAIL,
    orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }],
    take: 50,
  });
  return rows.map(present);
}

export async function listReservations(tenantId: string, rawQuery: unknown) {
  const q = ReservationListQuerySchema.parse(rawQuery);
  await refreshStatuses(tenantId);
  const term = q.q?.trim();
  const rows = await prisma.reservation.findMany({
    where: {
      tenantId,
      ...(q.status ? { status: q.status } : {}),
      ...(q.from ? { returnDate: { gte: dateOnly(q.from) } } : {}),
      ...(q.to ? { eventDate: { lte: dateOnly(q.to) } } : {}),
      ...(term
        ? {
            OR: [
              { code: { contains: term.toUpperCase() } },
              { client: { name: { contains: term, mode: "insensitive" as const } } },
              { client: { whatsapp: { contains: term.replace(/\D/g, "") || term } } },
            ],
          }
        : {}),
    },
    select: RESERVATION_DETAIL,
    orderBy: [{ eventDate: "asc" }, { createdAt: "asc" }],
    take: q.take + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > q.take;
  const items = (hasMore ? rows.slice(0, q.take) : rows).map(present);
  return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
}

// --- Mudança de status ----------------------------------------------------------

/**
 * RN10: PAGO chega pelo webhook do Mercado Pago. O dono pode marcar PAGO
 * manualmente (dinheiro, Pix direto), sempre registrado no AuditLog.
 * Cliente só pode cancelar a própria reserva enquanto aguarda pagamento.
 */
export async function updateReservationStatus(
  tenantId: string,
  actor: Actor,
  id: string,
  input: unknown,
  ip?: string,
  now = new Date(),
) {
  const { status: to, note } = ReservationStatusPatchSchema.parse(input);
  await refreshStatuses(tenantId, now);

  const updated = await prisma.$transaction(async (tx) => {
    const r = await tx.reservation.findFirst({
      where: { tenantId, OR: [{ id }, { code: id.toUpperCase() }] },
      select: {
        id: true,
        status: true,
        dealType: true,
        returnDate: true,
        subtotal: true,
        weekendFee: true,
        deliveryFee: true,
        damageFee: true,
        client: { select: { userId: true } },
      },
    });
    if (!r) throw Errors.notFound("Reserva não encontrada");

    if (!isStaff(actor.role)) {
      if (r.client.userId !== actor.id) throw Errors.notFound("Reserva não encontrada");
      if (!(r.status === "PENDENTE" && to === "CANCELADO")) throw Errors.forbidden("Fale com a loja para alterar esta reserva");
    }
    if (to === "PAGO" && actor.role !== "SUPER_ADMIN") throw Errors.forbidden("Só o dono confirma pagamento manual");
    if (!canTransition(r.status, to)) {
      throw Errors.conflict(`Não é possível mudar de ${r.status} para ${to}`);
    }

    const data: Prisma.ReservationUpdateInput = { status: to };
    if (to === "PAGO") Object.assign(data, { paidAt: now, holdExpiresAt: null });
    if (to === "EM_LOCACAO") data.deliveredAt = now;
    if (to === "CANCELADO") data.cancelledAt = now;
    if (to === "DEVOLVIDO") {
      data.returnedAt = now;
      if (r.dealType === "ALUGUEL") {
        const settings = await tx.tenantSettings.findUniqueOrThrow({ where: { tenantId }, select: { lateFeePerDay: true } });
        const lateFee = lateDays(toIso(r.returnDate), now) * settings.lateFeePerDay;
        Object.assign(data, { lateFee, totalPrice: r.subtotal + r.weekendFee + r.deliveryFee + r.damageFee + lateFee });
      }
    }

    // Trava otimista: só muda se ninguém mudou o status no meio do caminho.
    const { count } = await tx.reservation.updateMany({ where: { id: r.id, status: r.status }, data: data as Prisma.ReservationUpdateManyMutationInput });
    if (count === 0) throw Errors.conflict("A reserva mudou enquanto você editava. Atualize a página.");
    if (to === "CANCELADO") await release(tx, r.id);

    return { from: r.status as ReservationStatus, row: await tx.reservation.findUniqueOrThrow({ where: { id: r.id }, select: RESERVATION_DETAIL }) };
  });

  await audit({
    tenantId,
    action: "RESERVATION_STATUS",
    actorId: actor.id,
    targetId: updated.row.id,
    ip,
    metadata: { from: updated.from, to, ...(note ? { note } : {}) },
  });
  return present(updated.row);
}
