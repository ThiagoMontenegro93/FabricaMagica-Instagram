"use client";

import { useCallback, useEffect, useState } from "react";
import { formatBRL } from "@fabrica/shared";
import { api, ApiError } from "@/lib/api";
import type { ReservationDTO } from "@/lib/reservation-types";

type Damage = { id: string; note: string; fee: number; photos: string[]; createdAt: string; theme: { id: string; name: string } | null };

const OPEN = new Set(["EM_LOCACAO", "ATRASADO", "DEVOLVIDO"]);

/** Check-out da devolução: registrar avaria com foto e multa (somada ao total). */
export function DamagePanel({ r, isOwner, onChange }: { r: ReservationDTO; isOwner: boolean; onChange: () => void }) {
  const [items, setItems] = useState<Damage[]>([]);
  const [open, setOpen] = useState(false);
  const [themeId, setThemeId] = useState("");
  const [note, setNote] = useState("");
  const [fee, setFee] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ items: Damage[] }>(`/api/reservations/${r.id}/damages`).then((x) => setItems(x.items)).catch(() => undefined);
  }, [r.id]);
  useEffect(load, [load]);

  if (r.dealType !== "ALUGUEL" || (!OPEN.has(r.status) && items.length === 0)) return null;
  const canAdd = OPEN.has(r.status);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", "image");
      const x = await api<{ url: string }>("/api/uploads/media", { method: "POST", body: form });
      setPhotos((p) => [...p, x.url].slice(0, 6));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não foi possível enviar a foto");
    } finally {
      setBusy(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const cents = Math.round(Number(fee.replace(/\./g, "").replace(",", ".") || "0") * 100);
    if (!Number.isFinite(cents) || cents < 0) return setError("Valor inválido");
    setBusy(true);
    setError(null);
    try {
      await api(`/api/reservations/${r.id}/damages`, {
        method: "POST",
        body: JSON.stringify({ note, fee: cents, photos, themeId: themeId || undefined }),
      });
      setNote("");
      setFee("");
      setPhotos([]);
      setThemeId("");
      setOpen(false);
      load();
      onChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remover esta avaria e tirar a multa do total?")) return;
    try {
      await api(`/api/reservations/${r.id}/damages/${id}`, { method: "DELETE" });
      load();
      onChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Erro ao remover");
    }
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-neutral-500">Avarias</p>
        {canAdd && !open && (
          <button type="button" className="text-sm text-gold hover:underline" onClick={() => setOpen(true)}>
            + Registrar
          </button>
        )}
      </div>

      {items.length === 0 && !open && <p className="text-sm text-neutral-500">Nada registrado. Confira o tema quando voltar.</p>}

      {items.length > 0 && (
        <ul className="space-y-3">
          {items.map((d) => (
            <li key={d.id} className="space-y-2 rounded-xl border border-white/5 bg-field p-3 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-white">{d.theme?.name ?? "Geral"}</span>
                <span className="tabular-nums text-amber-200">{formatBRL(d.fee)}</span>
              </div>
              <p className="text-neutral-400">{d.note}</p>
              {d.photos.length > 0 && (
                <div className="flex gap-2">
                  {d.photos.map((p) => (
                    <a key={p} href={p} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p} alt="Foto da avaria" className="h-14 w-14 rounded-lg object-cover" />
                    </a>
                  ))}
                </div>
              )}
              {isOwner && (
                <button type="button" className="text-xs text-neutral-500 hover:text-red-300" onClick={() => remove(d.id)}>
                  Remover
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {open && (
        <form onSubmit={save} className="pop-in space-y-3">
          {r.themes.length > 1 && (
            <select className="field text-sm" value={themeId} onChange={(e) => setThemeId(e.target.value)} aria-label="Tema">
              <option value="">Geral</option>
              {r.themes.map((t) => (
                <option key={t.id} value={t.theme.id}>{t.theme.name}</option>
              ))}
            </select>
          )}
          <textarea className="field min-h-20 text-sm" placeholder="O que aconteceu? Ex.: abóbora grande rachada" value={note} onChange={(e) => setNote(e.target.value)} required minLength={3} />
          <label className="block text-sm text-neutral-400">
            Valor da multa (R$)
            <input className="field mt-1 tabular-nums" inputMode="decimal" placeholder="0,00" value={fee} onChange={(e) => setFee(e.target.value)} />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {photos.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={p} src={p} alt="" className="h-12 w-12 rounded-lg object-cover" />
            ))}
            {photos.length < 6 && (
              <label className="cursor-pointer rounded-lg border border-dashed border-white/20 px-3 py-2 text-xs text-neutral-400 transition-colors hover:border-gold/50 hover:text-gold">
                + Foto
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} disabled={busy} />
              </label>
            )}
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-gold flex-1 py-2 text-sm" disabled={busy}>{busy ? "Salvando..." : "Salvar avaria"}</button>
            <button type="button" className="btn-ghost px-4 py-2 text-sm" onClick={() => setOpen(false)}>Cancelar</button>
          </div>
        </form>
      )}
      {error && <p className="alert-error" role="alert">{error}</p>}
    </div>
  );
}
