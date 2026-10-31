"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DOCUMENT_LABELS, formatBRL, formatDateBR, whatsappLink, type Address, type DealType, type DocumentKind, type ReservationStatus } from "@fabrica/shared";
import { api, ApiError } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";

interface Detail {
  client: {
    id: string; name: string; cpf: string; rg: string; birthDate: string; email: string; whatsapp: string; phone2: string | null;
    address: Address; partyAddress: Address | null; docsVerifiedAt: string | null; contractVersion: string | null; createdAt: string;
    reservations: { id: string; code: string; status: ReservationStatus; dealType: DealType; eventDate: string; totalPrice: number }[];
  };
  documents: { mode: "UPLOAD" | "WHATSAPP"; missing: DocumentKind[]; documents: { id: string; kind: DocumentKind; createdAt: string; retainUntil: string }[] };
}

const addr = (a: Address) => `${a.rua}, ${a.numero}${a.complemento ? ` ${a.complemento}` : ""} · ${a.bairro}, ${a.cidade}/${a.estado}`;

export default function AdminClientePage({ params }: { params: { id: string } }) {
  const [d, setD] = useState<Detail | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    api<Detail>(`/api/clients/${params.id}`)
      .then(setD)
      .catch((e) => setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Erro ao carregar" }));
  }, [params.id]);
  useEffect(load, [load]);

  async function open(id: string) {
    // Abre a aba antes do await para o navegador não bloquear o pop-up.
    const tab = window.open("about:blank", "_blank");
    try {
      const { url } = await api<{ url: string }>(`/api/documents/${id}/link`, { method: "POST" });
      if (tab) tab.location.href = url;
    } catch (e) {
      tab?.close();
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Erro ao abrir" });
    }
  }

  async function verify(verified: boolean) {
    try {
      await api(`/api/clients/${params.id}/verify-docs`, { method: "PATCH", body: JSON.stringify({ verified }) });
      setMsg({ ok: true, text: verified ? "Documentos marcados como conferidos." : "Conferência desfeita." });
      load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Erro" });
    }
  }

  if (!d) return <p className="text-neutral-400">{msg?.text ?? "Carregando..."}</p>;
  const c = d.client;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <Link href="/admin/clientes" className="text-sm text-neutral-400 hover:text-gold">← Clientes</Link>
        <h1 className="font-serif text-4xl text-white">{c.name}</h1>
        <div className="card grid gap-4 text-sm sm:grid-cols-2">
          <Field label="CPF" value={c.cpf} mono />
          <Field label="RG" value={c.rg} mono />
          <Field label="Nascimento" value={formatDateBR(c.birthDate.slice(0, 10))} />
          <Field label="E-mail" value={c.email} />
          <Field label="WhatsApp" value={c.whatsapp} />
          <Field label="Cliente desde" value={formatDateBR(c.createdAt.slice(0, 10))} />
          <div className="sm:col-span-2"><Field label="Endereço" value={addr(c.address)} /></div>
          {c.partyAddress && <div className="sm:col-span-2"><Field label="Endereço da festa" value={addr(c.partyAddress)} /></div>}
        </div>

        <div className="space-y-3">
          <h2 className="font-serif text-2xl text-white">Reservas</h2>
          {c.reservations.length === 0 && <p className="text-neutral-500">Nenhuma reserva ainda.</p>}
          <ul className="space-y-2">
            {c.reservations.map((r) => (
              <li key={r.id}>
                <Link href={`/admin/reservas/${r.id}`} className="card flex items-center justify-between gap-3 p-4 transition-colors hover:border-gold/40">
                  <span className="font-mono text-gold">{r.code}</span>
                  <span className="text-neutral-400">{formatDateBR(r.eventDate)}</span>
                  <StatusBadge status={r.status} dealType={r.dealType} />
                  <span className="tabular-nums">{formatBRL(r.totalPrice)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <aside className="space-y-4 lg:pt-14">
        <a className="btn-ghost w-full" href={whatsappLink(`Olá ${c.name.split(" ")[0]}! Aqui é da Fábrica Mágica.`, c.whatsapp)} target="_blank" rel="noopener noreferrer">
          Chamar no WhatsApp
        </a>
        <div className="card space-y-3">
          <p className="text-xs uppercase tracking-wider text-neutral-500">Documentos</p>
          {c.docsVerifiedAt ? (
            <p className="alert-ok">Conferidos em {new Date(c.docsVerifiedAt).toLocaleDateString("pt-BR")}</p>
          ) : (
            <p className="text-sm text-amber-200">Ainda não conferidos.</p>
          )}
          {d.documents.mode === "WHATSAPP" && <p className="text-sm text-neutral-400">Modo econômico: confira pelo WhatsApp e marque abaixo.</p>}
          <ul className="space-y-2">
            {d.documents.documents.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-neutral-200">{DOCUMENT_LABELS[doc.kind]}</span>
                <button type="button" className="text-gold hover:underline" onClick={() => open(doc.id)}>Ver (15 min)</button>
              </li>
            ))}
          </ul>
          {d.documents.mode === "UPLOAD" && d.documents.missing.length > 0 && (
            <p className="text-xs text-neutral-500">Faltam: {d.documents.missing.map((k) => DOCUMENT_LABELS[k]).join(", ")}</p>
          )}
          <button type="button" className={c.docsVerifiedAt ? "btn-ghost w-full py-2 text-sm" : "btn-gold w-full"} onClick={() => verify(!c.docsVerifiedAt)}>
            {c.docsVerifiedAt ? "Desfazer conferência" : "Marcar como conferidos"}
          </button>
          <p className="text-xs text-neutral-500">Cada abertura de documento fica registrada no histórico de acessos.</p>
        </div>
        {msg && <p className={msg.ok ? "alert-ok" : "alert-error"}>{msg.text}</p>}
      </aside>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-neutral-500">{label}</p>
      <p className={`mt-0.5 text-white ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}
