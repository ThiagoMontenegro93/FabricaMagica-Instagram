import type { DealType, ReservationStatus } from "./constants";
import { LATE_TOLERANCE_HOURS } from "./constants";
import { daysBetween, storeDateOf } from "./dates";

/** Rótulo do status para o cliente; na venda "em locação" vira "entregue". */
export function statusLabel(status: ReservationStatus, dealType: DealType = "ALUGUEL"): string {
  if (dealType === "VENDA") {
    if (status === "EM_LOCACAO") return "Entregue";
    if (status === "DEVOLVIDO") return "Concluído";
  }
  return {
    PENDENTE: "Aguardando pagamento",
    PAGO: "Pago",
    EM_LOCACAO: "Em locação",
    DEVOLVIDO: "Devolvido",
    ATRASADO: "Atrasado",
    CANCELADO: "Cancelado",
  }[status];
}

/** Próximos passos que a equipe pode dar a partir de um status (botões do painel). */
export function nextActions(status: ReservationStatus, dealType: DealType): { to: ReservationStatus; label: string }[] {
  const venda = dealType === "VENDA";
  switch (status) {
    case "PENDENTE":
      return [
        { to: "PAGO", label: "Marcar como pago (manual)" },
        { to: "CANCELADO", label: "Cancelar" },
      ];
    case "PAGO":
      return [
        { to: "EM_LOCACAO", label: venda ? "Marcar entregue" : "Entregue / retirado" },
        { to: "CANCELADO", label: "Cancelar" },
      ];
    case "EM_LOCACAO":
      return [{ to: "DEVOLVIDO", label: venda ? "Concluir" : "Registrar devolução" }];
    case "ATRASADO":
      return [{ to: "DEVOLVIDO", label: "Registrar devolução" }];
    default:
      return [];
  }
}

/**
 * RN08: dias de atraso cobráveis. A tolerância de 24h vale só para marcar ATRASADO;
 * passada a tolerância, conta cada dia depois da data de devolução.
 */
export function lateDays(returnDate: string, returnedAt: Date): number {
  const graceEnd = new Date(`${returnDate}T00:00:00-03:00`).getTime() + (24 + LATE_TOLERANCE_HOURS) * 3_600_000;
  if (returnedAt.getTime() <= graceEnd) return 0;
  return Math.max(0, daysBetween(returnDate, storeDateOf(returnedAt)));
}

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** Código curto da reserva, ex.: FM-7K2QXA (sem 0/O/1/I para ditar por telefone). */
export function reservationCode(random: (n: number) => Uint8Array): string {
  const bytes = random(6);
  return `FM-${Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("")}`;
}
