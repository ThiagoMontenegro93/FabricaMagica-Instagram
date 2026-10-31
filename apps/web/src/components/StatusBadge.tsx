import { statusLabel, type DealType, type ReservationStatus } from "@fabrica/shared";

const STYLES: Record<ReservationStatus, string> = {
  PENDENTE: "border-amber-400/40 bg-amber-950/30 text-amber-200",
  PAGO: "border-neon-green/40 bg-green-950/30 text-neon-green",
  EM_LOCACAO: "border-neon-purple/50 bg-purple-950/30 text-purple-200",
  DEVOLVIDO: "border-white/15 bg-white/5 text-neutral-300",
  ATRASADO: "border-red-400/50 bg-red-950/40 text-red-200",
  CANCELADO: "border-white/10 bg-transparent text-neutral-500",
};

export function StatusBadge({ status, dealType }: { status: ReservationStatus; dealType?: DealType }) {
  return <span className={`chip ${STYLES[status]}`}>{statusLabel(status, dealType)}</span>;
}
