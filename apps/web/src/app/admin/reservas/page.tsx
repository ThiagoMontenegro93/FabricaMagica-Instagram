"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RESERVATION_STATUSES, formatBRL, formatDateBR, statusLabel, type ReservationStatus } from "@fabrica/shared";
import { api, ApiError } from "@/lib/api";
import type { ReservationDTO } from "@/lib/reservation-types";
import { StatusBadge } from "@/components/StatusBadge";

export default function AdminReservasPage() {
  const [status, setStatus] = useState<ReservationStatus | "">("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [items, setItems] = useState<ReservationDTO[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function query(cursor?: string) {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (q.trim()) p.set("q", q.trim());
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (cursor) p.set("cursor", cursor);
    return api<{ items: ReservationDTO[]; nextCursor: string | null }>(`/api/reservations?${p}`);
  }

  useEffect(() => {
    const t = setTimeout(() => {
      query()
        .then((r) => {
          setItems(r.items);
          setNext(r.nextCursor);
          setError(null);
        })
        .catch((e) => setError(e instanceof ApiError ? e.message : "Erro ao carregar"));
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, q, from, to]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-serif text-4xl text-white">Reservas</h1>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label" htmlFor="q">Buscar</label>
            <input id="q" className="field w-56" placeholder="Código, nome ou WhatsApp" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="from">De</label>
            <input id="from" type="date" className="field" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="to">Até</label>
            <input id="to" type="date" className="field" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Status">
        {(["", ...RESERVATION_STATUSES] as const).map((s) => (
          <button
            key={s || "todas"}
            type="button"
            role="radio"
            aria-checked={status === s}
            onClick={() => setStatus(s)}
            className={`press rounded-full border px-4 py-1.5 text-sm transition-colors ${status === s ? "border-gold bg-gold/10 text-gold" : "border-white/10 text-neutral-300 hover:border-gold/50"}`}
          >
            {s ? statusLabel(s) : "Todas"}
          </button>
        ))}
      </div>

      {error && <p className="alert-error">{error}</p>}
      {!items && !error && <p className="text-neutral-400">Carregando...</p>}
      {items && items.length === 0 && <p className="card text-neutral-400">Nenhuma reserva com esses filtros.</p>}

      {items && items.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-neutral-400">
              <tr className="border-b border-white/5">
                <th className="px-4 py-3 font-medium">Código</th>
                <th className="font-medium">Cliente</th>
                <th className="font-medium">Itens</th>
                <th className="font-medium">Data</th>
                <th className="font-medium">Transporte</th>
                <th className="font-medium">Total</th>
                <th className="pr-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className="border-t border-white/5 transition-colors hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <Link href={`/admin/reservas/${r.id}`} className="font-mono text-gold hover:underline">{r.code}</Link>
                  </td>
                  <td>{r.client.name}</td>
                  <td className="max-w-[220px] truncate text-neutral-300">
                    {[...r.themes.map((t) => t.theme.name), ...r.characters.map((c) => c.character.name)].join(", ")}
                  </td>
                  <td className="tabular-nums">
                    {formatDateBR(r.eventDate)}
                    {r.returnDate !== r.eventDate && <span className="text-neutral-500"> → {formatDateBR(r.returnDate)}</span>}
                  </td>
                  <td className="text-neutral-300">{r.themes.length === 0 ? "—" : r.deliveryType === "ENTREGA" ? "Entrega" : "Retirada"}</td>
                  <td className="tabular-nums text-gold">{formatBRL(r.totalPrice)}</td>
                  <td className="pr-4"><StatusBadge status={r.status} dealType={r.dealType} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {next && (
        <button
          type="button"
          className="btn-ghost"
          onClick={() => query(next).then((r) => { setItems((x) => [...(x ?? []), ...r.items]); setNext(r.nextCursor); })}
        >
          Carregar mais
        </button>
      )}
    </div>
  );
}
