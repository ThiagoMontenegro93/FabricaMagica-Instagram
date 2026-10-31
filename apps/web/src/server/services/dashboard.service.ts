import { Prisma, prisma } from "@fabrica/db";
import { STORE_UTC_OFFSET, todayInStore, type Role } from "@fabrica/shared";
import { refreshStatuses } from "./reservation.service";

const dateOnly = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const toIso = (d: Date) => d.toISOString().slice(0, 10);
const plusDays = (iso: string, n: number) => toIso(new Date(dateOnly(iso).getTime() + n * 86_400_000));
/** Início de um dia/mês no fuso da loja, como instante. */
const storeInstant = (iso: string) => new Date(`${iso}T00:00:00${STORE_UTC_OFFSET}`);

const ROW = {
  id: true,
  code: true,
  status: true,
  dealType: true,
  deliveryType: true,
  eventDate: true,
  returnDate: true,
  totalPrice: true,
  client: { select: { name: true, whatsapp: true } },
  themes: { select: { quantity: true, theme: { select: { name: true } } } },
  characters: { select: { startsAt: true, character: { select: { name: true } } }, orderBy: { startsAt: "asc" as const } },
} satisfies Prisma.ReservationSelect;

type Row = Prisma.ReservationGetPayload<{ select: typeof ROW }>;
const present = (r: Row) => ({
  id: r.id,
  code: r.code,
  status: r.status,
  dealType: r.dealType,
  deliveryType: r.deliveryType,
  eventDate: toIso(r.eventDate),
  returnDate: toIso(r.returnDate),
  totalPrice: r.totalPrice,
  client: r.client,
  items: [
    ...r.themes.map((t) => (t.quantity > 1 ? `${t.theme.name} ×${t.quantity}` : t.theme.name)),
    ...r.characters.map((c) => c.character.name),
  ],
  characterTimes: r.characters.map((c) => ({ name: c.character.name, startsAt: c.startsAt.toISOString() })),
});
export type DashboardRow = ReturnType<typeof present>;

/**
 * Painel do dia (Sprint 6). A equipe vê a operação; só o dono vê dinheiro.
 * Tudo é calculado no dia civil do Rio, não no UTC do servidor.
 */
export async function getDashboard(tenantId: string, role: Role, now = new Date()) {
  await refreshStatuses(tenantId, now);
  const today = todayInStore(now);
  const todayD = dateOnly(today);
  const weekEnd = dateOnly(plusDays(today, 7));

  const [toLeave, toReturn, late, upcoming, pending] = await Promise.all([
    // Saídas: pagas cuja festa é hoje (ou já passou e ainda não saíram).
    prisma.reservation.findMany({
      where: { tenantId, status: "PAGO", eventDate: { lte: todayD } },
      select: ROW,
      orderBy: { eventDate: "asc" },
    }),
    prisma.reservation.findMany({
      where: { tenantId, status: "EM_LOCACAO", dealType: "ALUGUEL", returnDate: todayD },
      select: ROW,
      orderBy: { code: "asc" },
    }),
    prisma.reservation.findMany({ where: { tenantId, status: "ATRASADO" }, select: ROW, orderBy: { returnDate: "asc" } }),
    prisma.reservation.findMany({
      where: { tenantId, status: { in: ["PAGO", "PENDENTE"] }, eventDate: { gt: todayD, lte: weekEnd } },
      select: ROW,
      orderBy: [{ eventDate: "asc" }, { code: "asc" }],
      take: 30,
    }),
    prisma.reservation.aggregate({ where: { tenantId, status: "PENDENTE" }, _count: true, _sum: { totalPrice: true } }),
  ]);

  const operations = {
    today,
    toLeave: toLeave.map(present),
    toReturn: toReturn.map(present),
    late: late.map(present),
    upcoming: upcoming.map(present),
    pending: { count: pending._count, total: pending._sum.totalPrice ?? 0 },
  };
  if (role !== "SUPER_ADMIN") return { ...operations, finance: null };

  // --- Dinheiro (só o dono) ---------------------------------------------------
  const month = today.slice(0, 7);
  const monthStart = storeInstant(`${month}-01`);
  const [y, m] = month.split("-").map(Number) as [number, number];
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (5 - i), 1));
    return toIso(d).slice(0, 7);
  });
  const seriesStart = storeInstant(`${months[0]}-01`);
  const reviewSince = new Date(now.getTime() - 30 * 86_400_000);

  const [paid, reviews, topThemes] = await Promise.all([
    prisma.reservation.findMany({
      where: { tenantId, paidAt: { gte: seriesStart }, status: { not: "CANCELADO" } },
      select: { paidAt: true, totalPrice: true, lateFee: true, damageFee: true },
    }),
    prisma.auditLog.findMany({
      where: { tenantId, action: "PAYMENT_NEEDS_REVIEW", createdAt: { gte: reviewSince } },
      select: { id: true, targetId: true, metadata: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.reservationTheme.groupBy({
      by: ["themeId"],
      where: { reservation: { tenantId, paidAt: { gte: monthStart }, status: { not: "CANCELADO" } } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 3,
    }),
  ]);

  const byMonth = new Map(months.map((k) => [k, 0]));
  let monthRevenue = 0;
  let monthCount = 0;
  let monthExtras = 0;
  for (const r of paid) {
    const key = new Date(r.paidAt!.getTime() + -3 * 3_600_000).toISOString().slice(0, 7);
    if (byMonth.has(key)) byMonth.set(key, (byMonth.get(key) ?? 0) + r.totalPrice);
    if (r.paidAt! >= monthStart) {
      monthRevenue += r.totalPrice;
      monthCount += 1;
      monthExtras += r.lateFee + r.damageFee;
    }
  }

  const codes = new Map(
    (
      await prisma.reservation.findMany({
        where: { tenantId, id: { in: reviews.map((r) => r.targetId) } },
        select: { id: true, code: true },
      })
    ).map((r) => [r.id, r.code]),
  );
  const themeNames = new Map(
    (await prisma.partyTheme.findMany({ where: { id: { in: topThemes.map((t) => t.themeId) } }, select: { id: true, name: true } })).map((t) => [
      t.id,
      t.name,
    ]),
  );

  return {
    ...operations,
    finance: {
      month,
      revenue: monthRevenue,
      count: monthCount,
      averageTicket: monthCount ? Math.round(monthRevenue / monthCount) : 0,
      extras: monthExtras,
      series: months.map((k) => ({ month: k, total: byMonth.get(k) ?? 0 })),
      topThemes: topThemes.map((t) => ({ name: themeNames.get(t.themeId) ?? "Tema removido", quantity: t._sum.quantity ?? 0 })),
      reviews: reviews.map((r) => {
        const meta = (r.metadata ?? {}) as { reason?: string };
        return { id: r.id, reservationId: r.targetId, code: codes.get(r.targetId) ?? null, reason: meta.reason ?? "conferir", at: r.createdAt.toISOString() };
      }),
    },
  };
}
export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;
