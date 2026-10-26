"use client";

import { useEffect, useState } from "react";
import { formatBRL } from "@fabrica/shared";
import { api, ApiError } from "@/lib/api";
import { centsToReais, reaisToCents } from "@/lib/money";

interface Character {
  id: string;
  name: string;
  description: string | null;
  pricePer2h: number;
  priceExtraHour: number;
  active: boolean;
}
interface Slot {
  id: string;
  kind: "RESERVA" | "BLOQUEIO";
  startsAt: string;
  endsAt: string;
  note: string | null;
}

const fmt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

/** RF03 / RF10: personagens vivos e agenda com bloqueios. */
export default function AdminPersonagensPage() {
  const [items, setItems] = useState<Character[]>([]);
  const [selected, setSelected] = useState<Character | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [form, setForm] = useState({ id: "", name: "", price2h: "", priceExtra: "" });
  const [block, setBlock] = useState({ start: "", end: "", note: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () => api<{ items: Character[] }>("/api/characters?all=1").then((r) => setItems(r.items));
  const loadSlots = (id: string) => api<{ items: Slot[] }>(`/api/characters/${id}/schedule`).then((r) => setSlots(r.items));
  useEffect(() => {
    load();
  }, []);

  const fail = (e: unknown) => setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Erro" });

  async function saveCharacter(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const body = { name: form.name, pricePer2h: reaisToCents(form.price2h), priceExtraHour: reaisToCents(form.priceExtra) };
    if (!Number.isFinite(body.pricePer2h) || !Number.isFinite(body.priceExtraHour)) return setMsg({ ok: false, text: "Confira os valores" });
    try {
      await api(form.id ? `/api/characters/${form.id}` : "/api/characters", { method: form.id ? "PATCH" : "POST", body: JSON.stringify(body) });
      setForm({ id: "", name: "", price2h: "", priceExtra: "" });
      setMsg({ ok: true, text: "Personagem salvo." });
      load();
    } catch (err) {
      fail(err);
    }
  }

  async function toggleActive(c: Character) {
    try {
      await api(`/api/characters/${c.id}`, { method: "PATCH", body: JSON.stringify({ active: !c.active }) });
      load();
    } catch (err) {
      fail(err);
    }
  }

  async function addBlock(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setMsg(null);
    try {
      await api(`/api/characters/${selected.id}/block`, {
        method: "POST",
        body: JSON.stringify({ startsAt: new Date(block.start).toISOString(), endsAt: new Date(block.end).toISOString(), note: block.note || undefined }),
      });
      setBlock({ start: "", end: "", note: "" });
      loadSlots(selected.id);
    } catch (err) {
      fail(err);
    }
  }

  async function removeBlock(id: string) {
    if (!selected) return;
    try {
      await api(`/api/characters/${selected.id}/block/${id}`, { method: "DELETE" });
      loadSlots(selected.id);
    } catch (err) {
      fail(err);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section className="space-y-4">
        <h1 className="font-serif text-4xl text-white">Personagens vivos</h1>
        {msg && <p className={msg.ok ? "text-sm text-neon-green" : "alert-error"}>{msg.text}</p>}
        <ul className="space-y-2">
          {items.map((c) => (
            <li key={c.id} className={`card flex items-center justify-between gap-3 p-4 ${selected?.id === c.id ? "border-gold/60" : ""}`}>
              <button
                className="text-left"
                onClick={() => {
                  setSelected(c);
                  loadSlots(c.id);
                }}
              >
                <p className={`font-serif text-lg ${c.active ? "text-white" : "text-neutral-500 line-through"}`}>{c.name}</p>
                <p className="text-xs text-gold">{formatBRL(c.pricePer2h)} / 2h · +{formatBRL(c.priceExtraHour)} hora extra</p>
              </button>
              <div className="flex gap-3 text-sm">
                <button className="text-neutral-400 hover:text-gold" onClick={() => setForm({ id: c.id, name: c.name, price2h: centsToReais(c.pricePer2h), priceExtra: centsToReais(c.priceExtraHour) })}>
                  Editar
                </button>
                <button className="text-neutral-400 hover:text-gold" onClick={() => toggleActive(c)}>{c.active ? "Desativar" : "Ativar"}</button>
              </div>
            </li>
          ))}
        </ul>

        <form onSubmit={saveCharacter} className="card space-y-3">
          <h2 className="font-serif text-2xl text-white">{form.id ? "Editar personagem" : "Novo personagem"}</h2>
          <input className="field" placeholder="Nome (ex.: Bruxa Elegante Luxo)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <div className="grid grid-cols-2 gap-3">
            <input className="field" placeholder="Valor 2h (R$)" inputMode="decimal" value={form.price2h} onChange={(e) => setForm({ ...form, price2h: e.target.value })} required />
            <input className="field" placeholder="Hora extra (R$)" inputMode="decimal" value={form.priceExtra} onChange={(e) => setForm({ ...form, priceExtra: e.target.value })} required />
          </div>
          <div className="flex gap-2">
            <button className="btn-gold">{form.id ? "Salvar" : "Cadastrar"}</button>
            {form.id && <button type="button" className="btn-ghost" onClick={() => setForm({ id: "", name: "", price2h: "", priceExtra: "" })}>Cancelar</button>}
          </div>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="font-serif text-3xl text-white">Agenda {selected ? `· ${selected.name}` : ""}</h2>
        {!selected ? (
          <p className="card text-neutral-400">Escolha um personagem para ver a agenda dos próximos 60 dias.</p>
        ) : (
          <>
            <ul className="space-y-2">
              {slots.length === 0 && <li className="card text-sm text-neutral-400">Agenda livre.</li>}
              {slots.map((s) => (
                <li key={s.id} className="card flex items-center justify-between p-4 text-sm">
                  <span>
                    <span className={s.kind === "RESERVA" ? "text-neon-green" : "text-neon-yellow"}>{s.kind === "RESERVA" ? "Festa" : "Bloqueio"}</span>{" "}
                    {fmt(s.startsAt)} → {fmt(s.endsAt)} {s.note && <span className="text-neutral-500">· {s.note}</span>}
                  </span>
                  {s.kind === "BLOQUEIO" && <button className="text-red-300" onClick={() => removeBlock(s.id)}>Remover</button>}
                </li>
              ))}
            </ul>
            <form onSubmit={addBlock} className="card space-y-3">
              <p className="font-serif text-xl text-white">Bloquear horário</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="bs">Início</label>
                  <input id="bs" type="datetime-local" className="field" value={block.start} onChange={(e) => setBlock({ ...block, start: e.target.value })} required />
                </div>
                <div>
                  <label className="label" htmlFor="be">Fim</label>
                  <input id="be" type="datetime-local" className="field" value={block.end} onChange={(e) => setBlock({ ...block, end: e.target.value })} required />
                </div>
              </div>
              <input className="field" placeholder="Motivo (opcional)" value={block.note} onChange={(e) => setBlock({ ...block, note: e.target.value })} />
              <button className="btn-gold">Bloquear</button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
