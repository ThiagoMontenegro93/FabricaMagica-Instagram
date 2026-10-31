"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { DOCUMENT_LABELS, documentVerificationMessage, formatDateBR, whatsappLink, type DocumentKind } from "@fabrica/shared";
import { api, ApiError } from "@/lib/api";

interface Doc { id: string; kind: DocumentKind; mimeType: string; sizeBytes: number; retainUntil: string; createdAt: string }
interface Status {
  mode: "UPLOAD" | "WHATSAPP";
  required: DocumentKind[];
  missing: DocumentKind[];
  verifiedAt: string | null;
  retentionDays: number;
  documents: Doc[];
}

export default function DocumentosPage() {
  const router = useRouter();
  const [s, setS] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<DocumentKind | null>(null);
  const [nextUrl, setNextUrl] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Status>("/api/documents")
      .then(setS)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) router.replace("/login?next=/conta/documentos");
        else if (e instanceof ApiError && e.status === 409) router.replace("/cadastro?next=/conta/documentos");
        else setError(e instanceof ApiError ? e.message : "Erro ao carregar");
      });
  }, [router]);
  useEffect(() => {
    load();
    const n = new URLSearchParams(window.location.search).get("next");
    if (n?.startsWith("/") && !n.startsWith("//")) setNextUrl(n);
  }, [load]);

  async function send(kind: DocumentKind, file: File) {
    setBusy(kind);
    setError(null);
    try {
      const form = new FormData();
      form.set("kind", kind);
      form.set("file", file);
      await api("/api/documents", { method: "POST", body: form });
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Erro ao enviar");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("Apagar este documento? Você poderá enviar de novo.")) return;
    await api(`/api/documents/${id}`, { method: "DELETE" }).catch(() => undefined);
    load();
  }

  if (!s) return <p className="text-neutral-400">{error ?? "Carregando..."}</p>;

  if (s.mode === "WHATSAPP") {
    return (
      <div className="mx-auto max-w-lg space-y-6 text-center">
        <h1 className="font-serif text-4xl text-white">Documentos</h1>
        <p className="text-neutral-300">A Fábrica Mágica não guarda seus documentos no site. A conferência é feita pelo WhatsApp, rapidinho.</p>
        <a className="btn-gold" href={whatsappLink(documentVerificationMessage("cliente"))} target="_blank" rel="noopener noreferrer">
          Enviar pelo WhatsApp
        </a>
      </div>
    );
  }

  const byKind = new Map(s.documents.map((d) => [d.kind, d]));
  const kinds = Array.from(new Set([...s.required, ...s.documents.map((d) => d.kind)]));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="fade-up space-y-2">
        <h1 className="font-serif text-4xl text-white">Seus documentos</h1>
        <p className="text-neutral-400">
          Usamos só para conferir quem está alugando. Os arquivos ficam criptografados, só a equipe abre (por link de 15 minutos) e
          apagamos tudo em {s.retentionDays} dias. Aceitamos foto (JPG ou PNG) ou PDF de até 5 MB.
        </p>
      </div>

      {s.verifiedAt ? (
        <p className="alert-ok">Documentos conferidos pela equipe. Tudo certo para reservar.</p>
      ) : s.missing.length === 0 ? (
        <p className="rounded-lg border border-amber-400/30 bg-amber-950/20 px-4 py-3 text-sm text-amber-200">Recebemos tudo. A equipe vai conferir em breve.</p>
      ) : null}
      {error && <p className="alert-error" role="alert">{error}</p>}

      <ul className="space-y-3">
        {kinds.map((kind, i) => (
          <DocRow key={kind} i={i} kind={kind} doc={byKind.get(kind)} busy={busy === kind} onFile={(f) => send(kind, f)} onRemove={remove} />
        ))}
      </ul>

      {nextUrl && s.missing.length === 0 && (
        <Link href={nextUrl} className="btn-gold w-full">Continuar minha reserva</Link>
      )}
    </div>
  );
}

function DocRow(props: { i: number; kind: DocumentKind; doc?: Doc; busy: boolean; onFile: (f: File) => void; onRemove: (id: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const { doc } = props;
  return (
    <li className="card fade-up flex flex-wrap items-center justify-between gap-3 p-4" style={{ ["--i" as string]: props.i }}>
      <div className="flex items-center gap-3">
        <span className={`grid h-9 w-9 place-items-center rounded-full text-sm ${doc ? "bg-neon-green/15 text-neon-green" : "bg-white/5 text-neutral-500"}`} aria-hidden>
          {doc ? "✓" : props.i + 1}
        </span>
        <div>
          <p className="text-white">{DOCUMENT_LABELS[props.kind]}</p>
          <p className="text-xs text-neutral-500">
            {doc ? `Enviado em ${formatDateBR(doc.createdAt.slice(0, 10))} · apagado em ${formatDateBR(doc.retainUntil.slice(0, 10))}` : "Pendente"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {doc && (
          <button type="button" className="text-sm text-neutral-500 transition-colors hover:text-red-300" onClick={() => props.onRemove(doc.id)}>
            Apagar
          </button>
        )}
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          capture={props.kind === "SELFIE" ? "user" : undefined}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) props.onFile(f);
            e.target.value = "";
          }}
        />
        <button type="button" className={doc ? "btn-ghost py-2 text-sm" : "btn-gold py-2 text-sm"} disabled={props.busy} onClick={() => input.current?.click()}>
          {props.busy ? "Enviando..." : doc ? "Trocar" : "Enviar"}
        </button>
      </div>
    </li>
  );
}
