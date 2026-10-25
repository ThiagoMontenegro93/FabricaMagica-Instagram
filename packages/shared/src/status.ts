import type { ReservationStatus } from "./constants";

/**
 * Máquina de estados da reserva. PENDENTE -> PAGO só via webhook (RN10),
 * a API deve checar a origem; aqui validamos apenas as transições permitidas.
 */
const TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  PENDENTE: ["PAGO", "CANCELADO"],
  PAGO: ["EM_LOCACAO", "CANCELADO", "ATRASADO"],
  EM_LOCACAO: ["DEVOLVIDO", "ATRASADO"],
  ATRASADO: ["DEVOLVIDO"],
  DEVOLVIDO: [],
  CANCELADO: [],
};

export function canTransition(from: ReservationStatus, to: ReservationStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
