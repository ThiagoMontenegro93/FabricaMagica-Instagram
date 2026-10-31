"use client";

import { useEffect, useState } from "react";
import { formatBRL, whatsappLink } from "@fabrica/shared";
import { api, ApiError } from "@/lib/api";
import type { ReservationDTO } from "@/lib/reservation-types";

type Mode = "mercadopago" | "simulado" | "off";
interface Pix { qrCode: string | null; qrCodeBase64: string | null; ticketUrl: string | null; simulated: boolean }

/** RF05: Pix (QR e copia-e-cola) ou cartão pelo Mercado Pago. A confirmação chega pelo webhook. */
export function PaymentPanel({ reservation: r, onPaid }: { reservation: ReservationDTO; onPaid?: () => void }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [tab, setTab] = useState<"pix" | "card">("pix");
  const [pix, setPix] = useState<Pix | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/tenant/public-settings")
      .then((x) => x.json())
      .then((s) => setMode(s.payments ?? "off"))
      .catch(() => setMode("off"));
  }, []);

  // Enquanto o Pix está na tela, confere a cada 4 s se o pagamento caiu.
  useEffect(() => {
    if (!pix) return;
    const id = setInterval(async () => {
      try {
        const x = await api<{ reservation: ReservationDTO }>(`/api/reservations/${r.id}`);
        if (x.reservation.status !== "PENDENTE") {
          clearInterval(id);
          onPaid?.();
        }
      } catch {
        // tenta de novo no próximo ciclo
      }
    }, 4000);
    return () => clearInterval(id);
  }, [pix, r.id, onPaid]);

  async function run<T>(fn: () => Promise<T>) {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não foi possível agora. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  const generatePix = () => run(async () => setPix(await api<Pix>(`/api/reservations/${r.id}/pix`, { method: "POST" })));
  const payCard = () =>
    run(async () => {
      const { url } = await api<{ url: string }>(`/api/reservations/${r.id}/card`, { method: "POST" });
      window.location.href = url;
    });
  const simulate = () =>
    run(async () => {
      await api(`/api/reservations/${r.id}/simulate`, { method: "POST" });
      onPaid?.();
    });

  async function copy() {
    if (!pix?.qrCode) return;
    await navigator.clipboard.writeText(pix.qrCode).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (mode === null) return <div className="card h-40 animate-pulse" aria-busy />;

  if (mode === "off") {
    return (
      <div className="card space-y-3">
        <p className="font-serif text-2xl text-white">Pagamento</p>
        <p className="text-sm text-neutral-400">Combine o pagamento de {formatBRL(r.totalPrice)} com a nossa equipe.</p>
        <a className="btn-gold w-full" href={whatsappLink(`Olá! Quero pagar a reserva ${r.code} (${formatBRL(r.totalPrice)}).`)} target="_blank" rel="noopener noreferrer">
          Pagar pelo WhatsApp
        </a>
      </div>
    );
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-baseline justify-between">
        <p className="font-serif text-2xl text-white">Pagamento</p>
        <p className="font-serif text-xl text-gold">{formatBRL(r.totalPrice)}</p>
      </div>

      <div role="tablist" aria-label="Forma de pagamento" className="grid grid-cols-2 gap-1 rounded-full border border-white/10 bg-field p-1">
        {(
          [
            ["pix", "Pix"],
            ["card", "Cartão"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`press rounded-full px-3 py-1.5 text-sm transition-colors ${tab === k ? "bg-gold font-semibold text-black" : "text-neutral-300 hover:text-white"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "pix" && !pix && (
        <div className="space-y-2">
          <p className="text-sm text-neutral-400">Aprovação na hora. O QR Code vale até o fim do prazo da reserva.</p>
          <button type="button" className="btn-gold w-full" onClick={generatePix} disabled={busy}>
            {busy ? "Gerando..." : "Gerar Pix"}
          </button>
        </div>
      )}

      {tab === "pix" && pix && (
        <div className="pop-in space-y-3 text-center">
          {pix.qrCodeBase64 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`data:image/png;base64,${pix.qrCodeBase64}`} alt="QR Code do Pix" className="mx-auto h-52 w-52 rounded-xl bg-white p-2" />
          ) : (
            <div className="mx-auto grid h-40 w-40 place-items-center rounded-xl border border-dashed border-white/20 text-xs text-neutral-500">
              {pix.simulated ? "QR de demonstração" : "Use o copia e cola"}
            </div>
          )}
          {pix.qrCode && (
            <div className="space-y-2">
              <p className="break-all rounded-lg bg-field px-3 py-2 text-left font-mono text-[11px] text-neutral-400">{pix.qrCode}</p>
              <button type="button" className="btn-ghost w-full py-2 text-sm" onClick={copy}>
                {copied ? "Copiado!" : "Copiar código Pix"}
              </button>
            </div>
          )}
          <p className="flex items-center justify-center gap-2 text-xs text-neutral-500">
            <span className="h-2 w-2 animate-pulse rounded-full bg-neon-green" aria-hidden /> Aguardando pagamento... a tela atualiza sozinha.
          </p>
        </div>
      )}

      {tab === "card" && (
        <div className="space-y-2">
          <p className="text-sm text-neutral-400">Crédito em até 12x no ambiente seguro do Mercado Pago.</p>
          <button type="button" className="btn-gold w-full" onClick={payCard} disabled={busy}>
            {busy ? "Abrindo..." : "Pagar com cartão"}
          </button>
        </div>
      )}

      {mode === "simulado" && (
        <button type="button" className="w-full rounded-lg border border-dashed border-neon-purple/50 px-3 py-2 text-xs text-purple-200 transition-colors hover:bg-purple-950/30" onClick={simulate} disabled={busy}>
          Modo demonstração: simular pagamento aprovado
        </button>
      )}
      {error && <p className="alert-error" role="alert">{error}</p>}
      <p className="text-center text-[11px] text-neutral-600">Pagamento processado pelo Mercado Pago. Não guardamos dados do cartão.</p>
    </div>
  );
}
