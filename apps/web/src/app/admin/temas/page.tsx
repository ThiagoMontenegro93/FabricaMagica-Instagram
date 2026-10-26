"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatBRL } from "@fabrica/shared";
import { api, ApiError } from "@/lib/api";

interface Row {
  id: string;
  slug: string;
  name: string;
  category: string;
  dailyPrice: number;
  totalQty: number;
  status: string;
  photos: string[];
}

const STATUS_LABEL: Record<string, string> = { ATIVO: "Ativo", MANUTENCAO: "Manutenção", DESCONTINUADO: "Oculto" };

/** RF02: lista de todos os temas, sem limite. O dono cria, edita, pausa e exclui. */
export default function AdminTemasPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => api<{ items: Row[] }>("/api/themes?all=1").then((r) => setRows(r.items)).catch((e) => setError(String(e.message)));
  useEffect(() => {
    load();
  }, []);

  async function setStatus(id: string, status: string) {
    setError(null);
    try {
      await api(`/api/themes/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Erro ao salvar");
    }
  }

  async function remove(row: Row) {
    if (!confirm(`Excluir o tema "${row.name}"? Ele some do site.`)) return;
    setError(null);
    try {
      await api(`/api/themes/${row.id}`, { method: "DELETE" });
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Erro ao excluir");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl text-white">Temas</h1>
          <p className="text-sm text-neutral-400">{rows ? `${rows.length} tema(s) cadastrados. Não há limite: cadastre quantos quiser.` : "Carregando..."}</p>
        </div>
        <Link href="/admin/temas/novo" className="btn-gold">+ Novo tema</Link>
      </div>
      {error && <p className="alert-error">{error}</p>}

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-neutral-400">
            <tr className="border-b border-white/5">
              <th className="p-4">Tema</th>
              <th>Categoria</th>
              <th>Diária</th>
              <th>Kits</th>
              <th>Status</th>
              <th className="text-right pr-4">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows?.map((r) => (
              <tr key={r.id} className="border-b border-white/5 last:border-0">
                <td className="p-4">
                  <Link href={`/admin/temas/${r.id}`} className="font-serif text-lg text-white hover:text-gold">{r.name}</Link>
                  {r.photos.length === 0 && <span className="ml-2 text-xs text-neon-yellow">sem foto</span>}
                </td>
                <td className="text-neutral-300">{r.category}</td>
                <td className="text-gold">{formatBRL(r.dailyPrice)}</td>
                <td>{r.totalQty}</td>
                <td>
                  <select className="field w-36 py-1" value={r.status} onChange={(e) => setStatus(r.id, e.target.value)} aria-label={`Status de ${r.name}`}>
                    {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </td>
                <td className="space-x-3 pr-4 text-right">
                  <Link href={`/temas/${r.slug}`} className="text-neutral-400 hover:text-gold" target="_blank">Ver</Link>
                  <Link href={`/admin/temas/${r.id}`} className="text-neutral-400 hover:text-gold">Editar</Link>
                  <button className="text-red-300 hover:text-red-200" onClick={() => remove(r)}>Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
