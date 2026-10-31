"use client";

import { formatBRL, whatsappLink } from "@fabrica/shared";
import type { ReservationDTO } from "@/lib/reservation-types";

/** Pagamento da reserva. Sem Mercado Pago configurado, o pagamento é combinado pelo WhatsApp. */
export function PaymentPanel({ reservation: r }: { reservation: ReservationDTO; onPaid?: () => void }) {
  return (
    <div className="card space-y-3">
      <p className="font-serif text-2xl text-white">Pagamento</p>
      <p className="text-sm text-neutral-400">Total de {formatBRL(r.totalPrice)}.</p>
      <a
        className="btn-gold w-full"
        href={whatsappLink(`Olá! Quero pagar a reserva ${r.code} (${formatBRL(r.totalPrice)}).`)}
        target="_blank"
        rel="noopener noreferrer"
      >
        Combinar pagamento no WhatsApp
      </a>
    </div>
  );
}
