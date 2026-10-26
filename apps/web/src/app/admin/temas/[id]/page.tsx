"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { OFFER_MODES, OFFER_MODE_LABELS, THEME_CATEGORIES } from "@fabrica/shared";
import { api, ApiError } from "@/lib/api";
import { ListEditor } from "@/components/ListEditor";
import { MediaManager } from "@/components/MediaManager";
import { ThemeCover } from "@/components/ThemeCard";
import { centsToReais, reaisToCents } from "@/lib/money";

interface Form {
  name: string;
  category: string;
  description: string;
  includedItems: string[];
  photos: string[];
  videoUrl: string | null;
  gifUrl: string | null;
  price: string; // em reais, como o dono digita
  deliveryFee: string; // vazio = frete padrão da loja
  totalQty: number;
  weekendPercent: string; // vazio = usa o padrão da loja
  offerMode: string; // vazio = padrão da loja
  salePrice: string; // em reais; vazio = não vende
  saleQty: number;
  allowPickup: TriState;
  allowDelivery: TriState;
  status: string;
  isBestseller: boolean;
  isNew: boolean;
}

/** "" = segue a loja; "sim"/"nao" = definido só para este tema. */
type TriState = "" | "sim" | "nao";
const toTri = (v: unknown): TriState => (v === true ? "sim" : v === false ? "nao" : "");
const fromTri = (v: TriState) => (v === "" ? null : v === "sim");

const EMPTY: Form = {
  name: "",
  category: THEME_CATEGORIES[0],
  description: "",
  includedItems: [],
  photos: [],
  videoUrl: null,
  gifUrl: null,
  price: "",
  deliveryFee: "",
  totalQty: 1,
  weekendPercent: "",
  offerMode: "",
  salePrice: "",
  saleQty: 0,
  allowPickup: "",
  allowDelivery: "",
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
    api<{ theme: Record<string, unknown> & { dailyPrice: number; weekendMultiplier: number | null; deliveryFee: number | null } }>(`/api/themes/${params.id}`)
      .then(({ theme: t }) =>
        setForm({
          name: t.name as string,
          category: t.category as string,
          description: t.description as string,
          includedItems: t.includedItems as string[],
          photos: t.photos as string[],
          videoUrl: (t.videoUrl as string | null) ?? null,
          gifUrl: (t.gifUrl as string | null) ?? null,
          price: centsToReais(t.dailyPrice),
          deliveryFee: t.deliveryFee === null ? "" : centsToReais(t.deliveryFee),
          totalQty: t.totalQty as number,
          weekendPercent: t.weekendMultiplier ? String(Math.round((t.weekendMultiplier - 1) * 100)) : "",
          offerMode: (t.offerMode as string | null) ?? "",
          salePrice: t.salePrice == null ? "" : centsToReais(t.salePrice as number),
          saleQty: (t.saleQty as number) ?? 0,
          allowPickup: toTri(t.allowPickup),
          allowDelivery: toTri(t.allowDelivery),
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
    const fee = form.deliveryFee.trim();
    const deliveryFee = fee === "" ? null : reaisToCents(fee);
    if (deliveryFee !== null && (!Number.isFinite(deliveryFee) || deliveryFee < 0)) return setError("Frete inválido, ex.: 400,00");
    const sale = form.salePrice.trim();
    const salePrice = sale === "" ? null : reaisToCents(sale);
    if (salePrice !== null && (!Number.isFinite(salePrice) || salePrice < 0)) return setError("Preço de venda inválido, ex.: 9.000,00");
    const body = {
      name: form.name,
      category: form.category,
      description: form.description,
      includedItems: form.includedItems,
      photos: form.photos,
      videoUrl: form.videoUrl,
      gifUrl: form.gifUrl,
      deliveryFee,
      dailyPrice,
      totalQty: form.totalQty,
      weekendMultiplier: pct === "" ? null : 1 + Number(pct) / 100,
      offerMode: form.offerMode === "" ? null : form.offerMode,
      salePrice,
      saleQty: form.saleQty,
      allowPickup: fromTri(form.allowPickup),
      allowDelivery: fromTri(form.allowDelivery),
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

        <div className="card grid gap-4 sm:grid-cols-4">
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
            <label className="label" htmlFor="wk">Taxa extra sex/sáb (%)</label>
            <input id="wk" className="field" inputMode="numeric" value={form.weekendPercent} onChange={(e) => set("weekendPercent", e.target.value)} placeholder="Padrão da loja" />
          </div>
          <div>
            <label className="label" htmlFor="fee">Frete (R$)</label>
            <input id="fee" className="field" inputMode="decimal" value={form.deliveryFee} onChange={(e) => set("deliveryFee", e.target.value)} placeholder="Padrão da loja" />
          </div>
        </div>

        <div className="card space-y-4">
          <h2 className="font-serif text-2xl text-white">Aluguel, venda e entrega</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="offerMode">Como aparece no site</label>
              <select id="offerMode" className="field" value={form.offerMode} onChange={(e) => set("offerMode", e.target.value)}>
                <option value="">Padrão da loja</option>
                {OFFER_MODES.map((m) => <option key={m} value={m}>{OFFER_MODE_LABELS[m]}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="salePrice">Preço de venda (R$)</label>
              <input id="salePrice" className="field" inputMode="decimal" value={form.salePrice} onChange={(e) => set("salePrice", e.target.value)} placeholder="Não vende" />
            </div>
            <div>
              <label className="label" htmlFor="saleQty">Unidades à venda</label>
              <input id="saleQty" className="field" type="number" min={0} value={form.saleQty} onChange={(e) => set("saleQty", Number(e.target.value))} />
            </div>
            <div>
              <label className="label" htmlFor="pickup">Cliente retira (sem frete)</label>
              <select id="pickup" className="field" value={form.allowPickup} onChange={(e) => set("allowPickup", e.target.value as TriState)}>
                <option value="">Padrão da loja</option>
                <option value="sim">Sim</option>
                <option value="nao">Não</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="delivery">Loja entrega (com frete)</label>
              <select id="delivery" className="field" value={form.allowDelivery} onChange={(e) => set("allowDelivery", e.target.value as TriState)}>
                <option value="">Padrão da loja</option>
                <option value="sim">Sim</option>
                <option value="nao">Não</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-neutral-500">
            "Padrão da loja" segue o que está em Configurações. Na venda não há taxa de fim de semana nem devolução.
          </p>
        </div>

        <div className="card space-y-3">
          <h2 className="font-serif text-2xl text-white">Fotos, vídeo e GIF</h2>
          <MediaManager
            value={{ photos: form.photos, videoUrl: form.videoUrl, gifUrl: form.gifUrl }}
            onChange={(m) => setForm({ ...form, ...m })}
          />
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
