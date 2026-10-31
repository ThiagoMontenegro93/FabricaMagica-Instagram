"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { nextActions, whatsappLink, type ReservationStatus } from "@fabrica/shared";
import { api, ApiError } from "@/lib/api";
import type { ReservationDTO } from "@/lib/reservation-types";
import { StatusBadge } from "@/components/StatusBadge";
import { ReservationSummary } from "@/components/ReservationSummary";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : null);

export default function AdminReservaPage({ params }: { params: { id: string } }) {
  const [r, setR] = useState<ReservationDTO | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<{ reservation: ReservationDTO }>(`/api/reservations/${params.id}`)
      .then((x) => setR(x.reservation))
      .catch((e) => setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Erro ao carregar" }));
  }, [params.id]);
  useEffect(() => {
    load();
    api<{ user: { role: string } }>("/api/auth/me").then((x) => setRole(x.user.role));
  }, [load]);

  async function move(to: ReservationStatus, label: string) {
    if (!r) return;
    if (to === "CANCELADO" && !confirm("Cancelar a reserva e liberar os itens?")) return;
    setBusy(true);
    setMsg(null);
    try {
      const x = await api<{ reservation: ReservationDTO }>(`/api/reservations/${r.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: to, note: note.trim() || undefined }),
      });
      setR(x.reservation);
      setNote("");
      setMsg({ ok: true, text: `${label}: feito.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Erro ao atualizar" });
    } finally {
      setBusy(false);
    }
  }

  if (!r) return <p className="text-neutral-400">{msg?.text ?? "Carregando..."}</p>;
  const actions = nextActions(r.status, r.dealType).filter((a) => a.to !== "PAGO" || role === "SUPER_ADMIN");
  const timeline = [
    ["Criada", fmt(r.createdAt)],
    ["Paga", fmt(r.paidAt)],
    [r.dealType === "VENDA" ? "Entregue" : "Entregue / retirada", fmt(r.deliveredAt)],
    [r.dealType === "VENDA" ? "Concluída" : "Devolvida", fmt(r.returnedAt)],
    ["Cancelada", fmt(r.cancelledAt)],
  ].filter(([, v]) => v);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <Link href="/admin/reservas" className="text-sm text-neutral-400 hover:text-gold">← Reservas</Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-4xl text-white">{r.code}</h1>
          <StatusBadge status={r.status} dealType={r.dealType} />
        </div>
        <div className="card"><ReservationSummary r={r} /></div>
      </div>

      <aside className="space-y-4 lg:pt-14">
        <div className="card space-y-2">
          <p className="text-xs uppercase tracking-wider text-neutral-500">Cliente</p>
          <p className="font-serif text-xl text-white">{r.client.name}</p>
          <p className="text-sm text-neutral-400">{r.client.email}</p>
          <a
            className="btn-ghost w-full py-2 text-sm"
            href={whatsappLink(`Olá ${r.client.name.split(" ")[0]}! Aqui é da Fábrica Mágica, sobre a reserva ${r.code}.`, r.client.whatsapp)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Chamar no WhatsApp
          </a>
        </div>

        {actions.length > 0 && (
          <div className="card space-y-3">
            <p className="text-xs uppercase tracking-wider text-neutral-500">Próximo passo</p>
            <textarea className="field min-h-20 text-sm" placeholder="Observação (opcional, vai para o histórico)" value={note} onChange={(e) => setNote(e.target.value)} />
            {actions.map((a) => (
              <button key={a.to} type="button" disabled={busy} onClick={() => move(a.to, a.label)} className={a.to === "CANCELADO" ? "btn-danger w-full" : "btn-gold w-full"}>
                {a.label}
              </button>
            ))}
          </div>
        )}
        {msg && <p className={msg.ok ? "alert-ok" : "alert-error"}>{msg.text}</p>}

        <div className="card space-y-2 text-sm">
          <p className="text-xs uppercase tracking-wider text-neutral-500">Histórico</p>
          <ol className="space-y-2">
            {timeline.map(([k, v]) => (
              <li key={k} className="flex justify-between gap-2"><span className="text-neutral-300">{k}</span><span className="text-neutral-500">{v}</span></li>
            ))}
          </ol>
        </div>
      </aside>
    </div>
  );
}
