"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { THEME_CATEGORIES } from "@fabrica/shared";
import { api, ApiError } from "@/lib/api";
import { ListEditor } from "@/components/ListEditor";
import { ThemeCover } from "@/components/ThemeCard";
import { centsToReais, reaisToCents } from "@/lib/money";

interface Form {
  name: string;
  category: string;
  description: string;
  includedItems: string[];
  photos: string[];
  price: string; // em reais, como o dono digita
  totalQty: number;
  weekendPercent: string; // vazio = usa o padrão da loja
  status: string;
  isBestseller: boolean;
  isNew: boolean;
}

const EMPTY: Form = {
  name: "",
  category: THEME_CATEGORIES[0],
  description: "",
  includedItems: [],
  photos: [],
  price: "",
  totalQty: 1,
  weekendPercent: "",
  status: "ATIVO",
  isBestseller: false,
  isNew: true,
};

/** Cadastro e edição de tema, pensado para o dono preencher rápido. */
export default function ThemeEditorPage({ params }: { params: { id: string } }) {
  const isNew = params.id === "novo";
  const router = useRouter();
  const [form, setForm] = useState<Form | null>(isNew ? EMPTY : null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew) return;
    api<{ theme: Record<string, unknown> & { dailyPrice: number; weekendMultiplier: number | null } }>(`/api/themes/${params.id}`)
      .then(({ theme: t }) =>
        setForm({
          name: t.name as string,
          category: t.category as string,
          description: t.description as string,
          includedItems: t.includedItems as string[],
          photos: t.photos as string[],
          price: centsToReais(t.dailyPrice),
          totalQty: t.totalQty as number,
          weekendPercent: t.weekendMultiplier ? String(Math.round((t.weekendMultiplier - 1) * 100)) : "",
          status: t.status as string,
          isBestseller: t.isBestseller as boolean,
          isNew: t.isNew as boolean,
        }),
      )
      .catch(() => setError("Tema não encontrado"));
  }, [isNew, params.id]);

  if (!form) return <p className="text-neutral-400">{error ?? "Carregando..."}</p>;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm({ ...form, [k]: v });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setError(null);
    const dailyPrice = reaisToCents(form.price);
    if (!Number.isFinite(dailyPrice) || dailyPrice < 0) return setError("Informe o valor da diária, ex.: 850,00");
    const pct = form.weekendPercent.trim();
    const body = {
      name: form.name,
      category: form.category,
      description: form.description,
      includedItems: form.includedItems,
      photos: form.photos,
      dailyPrice,
      totalQty: form.totalQty,
      weekendMultiplier: pct === "" ? null : 1 + Number(pct) / 100,
      status: form.status,
      isBestseller: form.isBestseller,
      isNew: form.isNew,
    };
    setSaving(true);
    try {
      await api(isNew ? "/api/themes" : `/api/themes/${params.id}`, { method: isNew ? "POST" : "PATCH", body: JSON.stringify(body) });
      router.push("/admin/temas");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        <Link href="/admin/temas" className="text-sm text-neutral-400 hover:text-gold">← Temas</Link>
        <h1 className="font-serif text-4xl text-white">{isNew ? "Novo tema" : form.name}</h1>
        {error && <p className="alert-error" role="alert">{error}</p>}

        <div className="card space-y-4">
          <div>
            <label className="label" htmlFor="name">Nome do tema</label>
            <input id="name" className="field" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex.: Harry Potter" required />
          </div>
          <div>
            <label className="label" htmlFor="category">Categoria</label>
            <input id="category" className="field" list="categories" value={form.category} onChange={(e) => set("category", e.target.value)} required />
            <datalist id="categories">
              {THEME_CATEGORIES.map((c) => <option key={c} value={c} />)}
            </datalist>
            <p className="mt-1 text-xs text-neutral-500">Escolha uma sugestão ou digite uma categoria nova.</p>
          </div>
          <div>
            <label className="label" htmlFor="description">Descrição</label>
            <textarea id="description" className="field min-h-28" value={form.description} onChange={(e) => set("description", e.target.value)} required />
          </div>
          <ListEditor label="Itens inclusos" value={form.includedItems} onChange={(v) => set("includedItems", v)} placeholder="Ex.: Painel 3x2m" />
        </div>

        <div className="card grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="price">Diária (R$)</label>
            <input id="price" className="field" inputMode="decimal" value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="850,00" required />
          </div>
          <div>
            <label className="label" htmlFor="qty">Kits iguais</label>
            <input id="qty" className="field" type="number" min={0} value={form.totalQty} onChange={(e) => set("totalQty", Number(e.target.value))} />
            <p className="mt-1 text-xs text-neutral-500">Quantas festas no mesmo dia.</p>
          </div>
          <div>
            <label className="label" htmlFor="wk">Acréscimo sex/sáb (%)</label>
            <input id="wk" className="field" inputMode="numeric" value={form.weekendPercent} onChange={(e) => set("weekendPercent", e.target.value)} placeholder="Padrão da loja" />
          </div>
        </div>

        <div className="card space-y-3">
          <ListEditor label="Fotos (links https)" value={form.photos} onChange={(v) => set("photos", v)} placeholder="https://..." />
          <p className="text-xs text-neutral-500">A primeira foto vira a capa. Envio direto de arquivos entra junto com o armazenamento em nuvem.</p>
        </div>
      </div>

      <aside className="space-y-4 lg:pt-16">
        <div className="card space-y-3 p-4">
          <div className="aspect-square overflow-hidden rounded-xl">
            <ThemeCover name={form.name || "?"} photos={form.photos} />
          </div>
          <div>
            <label className="label" htmlFor="status">Status</label>
            <select id="status" className="field" value={form.status} onChange={(e) => set("status", e.target.value)}>
              <option value="ATIVO">Ativo (aparece no site)</option>
              <option value="MANUTENCAO">Manutenção (aparece indisponível)</option>
              <option value="DESCONTINUADO">Oculto</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input type="checkbox" className="accent-[#D4AF37]" checked={form.isBestseller} onChange={(e) => set("isBestseller", e.target.checked)} />
            Selo "Mais alugado"
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input type="checkbox" className="accent-[#D4AF37]" checked={form.isNew} onChange={(e) => set("isNew", e.target.checked)} />
            Selo "Lançamento"
          </label>
          <button className="btn-gold w-full" disabled={saving}>{saving ? "Salvando..." : isNew ? "Cadastrar tema" : "Salvar alterações"}</button>
        </div>
      </aside>
    </form>
  );
}
