import type { ReservationStatus } from "./constants";
import { LATE_TOLERANCE_HOURS } from "./constants";
import { addHours, addMinutes } from "./dates";

/** Reserva vista pela regra de estoque: período [eventDate, returnDate] em dias civis. */
export interface StockReservation {
  status: ReservationStatus;
  eventDate: string; // YYYY-MM-DD
  returnDate: string; // YYYY-MM-DD
  quantity: number;
  /** Até quando uma reserva PENDENTE segura o estoque. */
  holdExpiresAt?: Date | null;
}

/** Estados que ocupam estoque fisicamente. */
const OCCUPYING: ReservationStatus[] = ["PAGO", "EM_LOCACAO", "ATRASADO"];

/**
 * Uma reserva ocupa estoque se está paga/em locação/atrasada,
 * ou se está PENDENTE com reserva temporária (hold) ainda válida.
 * Assim o estoque só "baixa" de fato no PAGO (RN10), mas dois clientes
 * não conseguem pagar o mesmo último item ao mesmo tempo (RN02).
 */
export function occupiesStock(r: StockReservation, now: Date): boolean {
  if (OCCUPYING.includes(r.status)) return true;
  return r.status === "PENDENTE" && !!r.holdExpiresAt && r.holdExpiresAt > now;
}

function overlapsDays(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  // Strings YYYY-MM-DD comparam corretamente em ordem lexicográfica.
  return aStart <= bEnd && bStart <= aEnd;
}

/** RN02: quantidade disponível de um tema no período pedido. */
export function availableThemeQty(
  totalQty: number,
  reservations: StockReservation[],
  period: { eventDate: string; returnDate: string },
  now: Date = new Date(),
): number {
  const used = reservations
    .filter((r) => occupiesStock(r, now))
    .filter((r) => overlapsDays(r.eventDate, r.returnDate, period.eventDate, period.returnDate))
    .reduce((acc, r) => acc + r.quantity, 0);
  return Math.max(0, totalQty - used);
}

export function canReserveTheme(
  totalQty: number,
  reservations: StockReservation[],
  period: { eventDate: string; returnDate: string },
  quantity: number,
  now: Date = new Date(),
): boolean {
  return availableThemeQty(totalQty, reservations, period, now) >= quantity;
}

/** Bloco de agenda de um personagem vivo. */
export interface CharacterSlot {
  startsAt: Date;
  durationMinutes: number;
}

/** RN03: personagem não pode estar em duas festas sobrepostas. */
export function slotsOverlap(a: CharacterSlot, b: CharacterSlot): boolean {
  const aEnd = addMinutes(a.startsAt, a.durationMinutes);
  const bEnd = addMinutes(b.startsAt, b.durationMinutes);
  return a.startsAt < bEnd && b.startsAt < aEnd;
}

export function isCharacterAvailable(existing: CharacterSlot[], wanted: CharacterSlot): boolean {
  return !existing.some((s) => slotsOverlap(s, wanted));
}

/** RN08: atrasado quando passou returnDate + 24h e ainda não foi devolvido. */
export function isLate(
  status: ReservationStatus,
  returnDate: Date,
  now: Date = new Date(),
): boolean {
  if (status !== "EM_LOCACAO" && status !== "PAGO") return false;
  return now > addHours(returnDate, LATE_TOLERANCE_HOURS);
}
