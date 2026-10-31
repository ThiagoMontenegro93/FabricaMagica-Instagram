"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { whatsappLink } from "@fabrica/shared";
import { api, ApiError } from "@/lib/api";
import type { ReservationDTO } from "@/lib/reservation-types";
import { StatusBadge } from "@/components/StatusBadge";
import { ReservationSummary } from "@/components/ReservationSummary";
import { HoldCountdown } from "@/components/HoldCountdown";
import { PaymentPanel } from "@/components/PaymentPanel";

export default function ReservaPage({ params }: { params: { code: string } }) {
  const router = useRouter();
  const [r, setR] = useState<ReservationDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<{ reservation: ReservationDTO }>(`/api/reservations/${params.code}`)
      .then((x) => setR(x.reservation))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) router.replace(`/login?next=/reservas/${params.code}`);
        else setError(e instanceof ApiError ? e.message : "Erro ao carregar");
      });
  }, [params.code, router]);
  useEffect(load, [load]);

  async function cancel() {
    if (!r || !confirm("Cancelar esta reserva? Os itens voltam a ficar disponíveis para outras pessoas.")) return;
    setBusy(true);
    try {
      const x = await api<{ reservation: ReservationDTO }>(`/api/reservations/${r.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "CANCELADO" }),
      });
      setR(x.reservation);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Erro ao cancelar");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="alert-error mx-auto max-w-2xl">{error}</p>;
  if (!r) return <p className="text-neutral-400">Carregando...</p>;

  return (
    <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <Link href="/reservas" className="text-sm text-neutral-400 hover:text-gold">← Minhas reservas</Link>
        <div className="fade-up flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-4xl text-white">Reserva {r.code}</h1>
          <StatusBadge status={r.status} dealType={r.dealType} />
        </div>
        <div className="card fade-up" style={{ ["--i" as string]: 1 }}>
          <ReservationSummary r={r} />
        </div>
      </div>

      <aside className="space-y-4 lg:pt-14">
        {r.status === "PENDENTE" && (
          <>
            {r.holdExpiresAt && (
              <div className="card fade-up space-y-1 border-amber-400/30 text-center" style={{ ["--i" as string]: 2 }}>
                <p className="text-sm text-neutral-400">Guardamos tudo para você por</p>
                <p className="font-serif text-4xl text-amber-200"><HoldCountdown until={r.holdExpiresAt} onExpire={load} /></p>
              </div>
            )}
            <PaymentPanel reservation={r} onPaid={load} />
            <button type="button" className="btn-danger w-full" onClick={cancel} disabled={busy}>Cancelar reserva</button>
          </>
        )}
        {r.status === "PAGO" && (
          <div className="card pop-in space-y-2 text-center">
            <p className="text-4xl" aria-hidden>✨</p>
            <p className="font-serif text-2xl text-white">Pagamento confirmado</p>
            <p className="text-sm text-neutral-400">Vamos falar com você pelo WhatsApp para combinar os detalhes.</p>
          </div>
        )}
        {r.status === "CANCELADO" && (
          <div className="card space-y-3 text-center text-sm text-neutral-400">
            <p>Esta reserva foi cancelada.</p>
            <Link href="/#temas" className="btn-ghost">Montar outra festa</Link>
          </div>
        )}
        <a
          className="block text-center text-sm text-neutral-400 transition-colors hover:text-gold"
          href={whatsappLink(`Olá! Tenho uma dúvida sobre a reserva ${r.code}.`)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Dúvidas? Fale com a gente no WhatsApp
        </a>
      </aside>
    </div>
  );
}
