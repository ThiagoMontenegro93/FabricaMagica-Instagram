"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDateBR, whatsappLink } from "@fabrica/shared";
import { api, ApiError } from "@/lib/api";

interface ClientRow {
  id: string;
  name: string;
  cpf: string;
  email: string;
  whatsapp: string;
  birthDate: string;
  docsVerifiedAt: string | null;
  createdAt: string;
}

export default function AdminClientesPage() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<ClientRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      api<{ items: ClientRow[] }>(`/api/clients?q=${encodeURIComponent(q)}&take=50`)
        .then((r) => setItems(r.items))
        .catch((e) => setError(e instanceof ApiError ? e.message : "Erro ao carregar"));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-serif text-4xl text-white">Clientes</h1>
        <input className="field w-72" placeholder="Nome, e-mail, CPF ou WhatsApp" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar cliente" />
      </div>
      {error && <p className="alert-error">{error}</p>}
      {items && items.length === 0 && <p className="card text-neutral-400">Nenhum cliente encontrado.</p>}
      {items && items.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-neutral-400">
              <tr className="border-b border-white/5">
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="font-medium">CPF</th>
                <th className="font-medium">Contato</th>
                <th className="font-medium">Documentos</th>
                <th className="pr-4 font-medium">Cadastro</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="border-t border-white/5">
                  <td className="px-4 py-3"><Link href={`/admin/clientes/${c.id}`} className="text-white hover:text-gold">{c.name}</Link></td>
                  <td className="font-mono text-xs text-neutral-300">{c.cpf}</td>
                  <td>
                    <a className="text-gold hover:underline" href={whatsappLink(undefined, c.whatsapp)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                    <span className="block text-xs text-neutral-500">{c.email}</span>
                  </td>
                  <td>{c.docsVerifiedAt ? <span className="chip border-neon-green/40 text-neon-green">Verificados</span> : <span className="chip border-white/10 text-neutral-400">Pendentes</span>}</td>
                  <td className="pr-4 text-neutral-400">{formatDateBR(c.createdAt.slice(0, 10))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
