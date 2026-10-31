"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { STORE_UTC_OFFSET, formatBRL, todayInStore, type Address, type DealType, type DeliveryType } from "@fabrica/shared";
import { api, ApiError } from "@/lib/api";
import { cart, useCart } from "@/lib/cart";
import { ThemeCover } from "@/components/ThemeCard";

interface QuoteResult {
  quote: { themesSubtotal: number; charactersSubtotal: number; weekendFee: number; deliveryFee: number; total: number; isWeekend: boolean };
  unavailable: string[];
  returnDate: string;
}
type MyClient = { name: string; address: Address; partyAddress: Address | null } | null;

const TIMES = Array.from({ length: 29 }, (_, i) => {
  const m = 8 * 60 + i * 30;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${m % 60 === 0 ? "00" : "30"}`;
});
const emptyAddress: Address = { cep: "", rua: "", numero: "", complemento: "", bairro: "", cidade: "Rio de Janeiro", estado: "RJ" };
const fmtAddress = (a: Address) => `${a.rua}, ${a.numero}${a.complemento ? ` ${a.complemento}` : ""} · ${a.bairro}, ${a.cidade}`;

export default function CarrinhoPage() {
  const c = useCart();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [me, setMe] = useState<MyClient | undefined>(undefined);
  const [otherAddress, setOtherAddress] = useState(false);
  const [address, setAddress] = useState<Address>(emptyAddress);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    api<{ client: MyClient }>("/api/clients/me")
      .then((r) => setMe(r.client))
      .catch(() => setMe(undefined));
  }, []);

  const rent = c.dealType === "ALUGUEL";
  const hasThemes = c.themes.length > 0;
  const today = todayInStore();

  const body = useMemo(() => {
    if (!c.eventDate) return null;
    return {
      eventDate: c.eventDate,
      returnDate: rent ? c.returnDate || c.eventDate : undefined,
      dealType: c.dealType,
      deliveryType: c.deliveryType,
      themes: c.themes.map((t) => ({ themeId: t.themeId, quantity: t.quantity })),
      characters: c.characters.map((x) => ({
        characterId: x.characterId,
        startsAt: `${c.eventDate}T${x.time}:00${STORE_UTC_OFFSET}`,
        extraHours: x.extraHours,
      })),
    };
  }, [c, rent]);

  // Cotação ao vivo: espera o cliente parar de mexer por 250 ms.
  useEffect(() => {
    if (!body || (body.themes.length === 0 && body.characters.length === 0)) {
      setQuote(null);
      return;
    }
    const t = setTimeout(() => {
      api<QuoteResult>("/api/reservations/quote", { method: "POST", body: JSON.stringify(body) })
        .then((q) => {
          setQuote(q);
          setQuoteError(null);
        })
        .catch((e) => {
          setQuote(null);
          setQuoteError(e instanceof ApiError ? e.message : "Não foi possível calcular agora");
        });
    }, 250);
    return () => clearTimeout(t);
  }, [body]);

  if (!mounted) return <p className="text-neutral-400">Carregando carrinho...</p>;

  if (c.themes.length === 0 && c.characters.length === 0) {
    return (
      <div className="mx-auto max-w-lg space-y-6 py-10 text-center fade-up">
        <p className="text-6xl" aria-hidden>🎃</p>
        <h1 className="font-serif text-4xl text-white">Seu carrinho está vazio</h1>
        <p className="text-neutral-400">Escolha um tema ou um personagem vivo para começar a montar a festa.</p>
        <Link href="/#temas" className="btn-gold">Ver temas</Link>
      </div>
    );
  }

  async function reservar() {
    if (!body) return setError("Escolha a data da festa");
    setError(null);
    setLoading(true);
    try {
      const deliveryAddress = hasThemes && c.deliveryType === "ENTREGA" && otherAddress ? address : undefined;
      const { reservation } = await api<{ reservation: { code: string } }>("/api/reservations", {
        method: "POST",
        body: JSON.stringify({ ...body, deliveryAddress }),
      });
      cart.clear();
      router.push(`/reservas/${reservation.code}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return router.push("/login?next=/carrinho");
      if (e instanceof ApiError && e.status === 409 && e.message.includes("cadastro")) return router.push("/cadastro?next=/carrinho");
      if (e instanceof ApiError && e.code === "DOCS_REQUIRED") return router.push("/conta/documentos?next=/carrinho");
      setError(e instanceof ApiError ? e.message : "Erro ao reservar");
    } finally {
      setLoading(false);
    }
  }

  const unavailable = new Set(quote?.unavailable ?? []);
  const savedAddress = me?.partyAddress ?? me?.address ?? null;

  return (
    <div className="space-y-8">
      <div className="fade-up">
        <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">{rent ? "Aluguel" : "Compra"}</p>
        <h1 className="font-serif text-4xl text-white md:text-5xl">Sua festa</h1>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {c.themes.map((t, i) => (
            <div key={t.themeId} className="card fade-up flex gap-4 p-4" style={{ ["--i" as string]: i }}>
              <Link href={`/temas/${t.slug}`} className="h-24 w-24 shrink-0 overflow-hidden rounded-xl">
                <ThemeCover name={t.name} photos={t.photo ? [t.photo] : []} compact />
              </Link>
              <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link href={`/temas/${t.slug}`} className="font-serif text-xl text-white hover:text-gold">{t.name}</Link>
                    <p className="text-sm text-neutral-400">
                      {rent ? `${formatBRL(t.dailyPrice)} / diária` : `${formatBRL(t.salePrice ?? 0)} cada`}
                    </p>
                  </div>
                  {unavailable.has(t.name) && <span className="chip border-red-400/40 text-red-200">Indisponível na data</span>}
                </div>
                <div className="flex items-center justify-between">
                  <Stepper value={t.quantity} onChange={(q) => cart.setQuantity(t.themeId, q)} label={`Quantidade de ${t.name}`} />
                  <button type="button" className="text-sm text-neutral-500 transition-colors hover:text-red-300" onClick={() => cart.setQuantity(t.themeId, 0)}>
                    Remover
                  </button>
                </div>
              </div>
            </div>
          ))}

          {c.characters.map((x, i) => (
            <div key={x.key} className="card fade-up space-y-3 p-4" style={{ ["--i" as string]: c.themes.length + i }}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-wider text-neon-pink">Personagem vivo</p>
                  <p className="font-serif text-xl text-white">{x.name}</p>
                  <p className="text-sm text-neutral-400">{formatBRL(x.pricePer2h)} por 2h · +{formatBRL(x.priceExtraHour)} a hora extra</p>
                </div>
                {unavailable.has(x.name) && <span className="chip border-red-400/40 text-red-200">Horário ocupado</span>}
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="label" htmlFor={`t-${x.key}`}>Chegada</label>
                  <select id={`t-${x.key}`} className="field w-28" value={x.time} onChange={(e) => cart.updateCharacter(x.key, { time: e.target.value })}>
                    {TIMES.map((h) => <option key={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor={`h-${x.key}`}>Duração</label>
                  <select id={`h-${x.key}`} className="field w-36" value={x.extraHours} onChange={(e) => cart.updateCharacter(x.key, { extraHours: Number(e.target.value) })}>
                    {[0, 1, 2, 3, 4].map((h) => <option key={h} value={h}>{2 + h} horas</option>)}
                  </select>
                </div>
                <button type="button" className="ml-auto text-sm text-neutral-500 transition-colors hover:text-red-300" onClick={() => cart.removeCharacter(x.key)}>
                  Remover
                </button>
              </div>
            </div>
          ))}

          <Link href="/#temas" className="inline-flex text-sm text-neutral-400 transition-colors hover:text-gold">+ Adicionar mais temas ou personagens</Link>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="card space-y-5">
            {hasThemes && (
              <Segmented<DealType>
                label="Alugar ou comprar"
                value={c.dealType}
                options={[
                  ["ALUGUEL", "Alugar"],
                  ["VENDA", "Comprar"],
                ]}
                onChange={(v) => cart.update({ dealType: v, ...(v === "VENDA" ? { characters: [] } : {}) })}
              />
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className={rent ? "" : "col-span-2"}>
                <label className="label" htmlFor="ev">{rent ? "Data da festa" : "Data de entrega"}</label>
                <input
                  id="ev"
                  type="date"
                  min={today}
                  className="field"
                  value={c.eventDate}
                  onChange={(e) => cart.update({ eventDate: e.target.value, returnDate: !c.returnDate || c.returnDate < e.target.value ? e.target.value : c.returnDate })}
                />
              </div>
              {rent && hasThemes && (
                <div>
                  <label className="label" htmlFor="rt">Devolução</label>
                  <input id="rt" type="date" min={c.eventDate || today} className="field" value={c.returnDate} onChange={(e) => cart.update({ returnDate: e.target.value })} />
                </div>
              )}
            </div>

            {hasThemes && (
              <Segmented<DeliveryType>
                label="Como o tema chega"
                value={c.deliveryType}
                options={[
                  ["RETIRADA", "Retiro na loja"],
                  ["ENTREGA", "A loja entrega"],
                ]}
                onChange={(v) => cart.update({ deliveryType: v })}
                hint={c.deliveryType === "RETIRADA" ? "Você busca e devolve na loja. Sem frete." : "Nossa equipe leva, monta e busca."}
              />
            )}

            {hasThemes && c.deliveryType === "ENTREGA" && (
              <div className="space-y-2 text-sm">
                {savedAddress && !otherAddress ? (
                  <p className="rounded-lg border border-white/10 bg-field px-3 py-2 text-neutral-300">
                    <span className="block text-xs text-neutral-500">Entregar em</span>
                    {fmtAddress(savedAddress)}
                  </p>
                ) : null}
                {me !== undefined && (
                  <label className="flex items-center gap-2 text-neutral-300">
                    <input type="checkbox" className="accent-[#D4AF37]" checked={otherAddress || !savedAddress} disabled={!savedAddress} onChange={(e) => setOtherAddress(e.target.checked)} />
                    {savedAddress ? "Entregar em outro endereço" : "Endereço da festa"}
                  </label>
                )}
                {me !== undefined && (otherAddress || !savedAddress) && <AddressFields value={address} onChange={setAddress} />}
                {me === undefined && <p className="text-xs text-neutral-500">O endereço sai do seu cadastro quando você entrar.</p>}
              </div>
            )}

            <div className="space-y-1.5 border-t border-white/5 pt-4 text-sm" aria-live="polite">
              {!c.eventDate && <p className="text-neutral-400">Escolha a data para ver o total e a disponibilidade.</p>}
              {quoteError && <p className="text-red-300">{quoteError}</p>}
              {quote && (
                <>
                  {quote.quote.themesSubtotal > 0 && <Line label={rent ? "Temas" : "Temas (compra)"} value={quote.quote.themesSubtotal} />}
                  {quote.quote.charactersSubtotal > 0 && <Line label="Personagens vivos" value={quote.quote.charactersSubtotal} />}
                  {quote.quote.weekendFee > 0 && <Line label="Taxa de fim de semana" value={quote.quote.weekendFee} />}
                  {hasThemes && <Line label="Frete" value={quote.quote.deliveryFee} free={c.deliveryType === "RETIRADA" ? "Você retira" : "Grátis"} />}
                  <p className="flex items-baseline justify-between pt-2 text-white">
                    <span className="font-semibold">Total</span>
                    <span className="font-serif text-3xl text-gold" data-testid="cart-total">{formatBRL(quote.quote.total)}</span>
                  </p>
                  {quote.unavailable.length > 0 && (
                    <p className="alert-error">Indisponível nessa data: {quote.unavailable.join(", ")}. Tente outra data ou horário.</p>
                  )}
                </>
              )}
            </div>

            {error && <p className="alert-error" role="alert">{error}</p>}
            <button type="button" className="btn-gold w-full py-3 text-base" onClick={reservar} disabled={loading || !quote || quote.unavailable.length > 0}>
              {loading ? "Reservando..." : "Reservar e ir para o pagamento"}
            </button>
            <p className="text-center text-xs text-neutral-500">Seguramos tudo por 30 minutos enquanto você paga.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Line({ label, value, free }: { label: string; value: number; free?: string }) {
  return (
    <p className="flex justify-between text-neutral-300">
      <span>{label}</span>
      <span>{value > 0 ? formatBRL(value) : (free ?? formatBRL(0))}</span>
    </p>
  );
}

function Stepper({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const btn = "press grid h-8 w-8 place-items-center rounded-full border border-white/10 text-neutral-200 hover:border-gold/60";
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <button type="button" className={btn} onClick={() => onChange(value - 1)} aria-label="Diminuir">−</button>
      <span className="w-6 text-center tabular-nums">{value}</span>
      <button type="button" className={btn} onClick={() => onChange(value + 1)} aria-label="Aumentar">+</button>
    </div>
  );
}

function Segmented<T extends string>(props: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void; hint?: string }) {
  return (
    <div>
      <p className="label">{props.label}</p>
      <div role="radiogroup" aria-label={props.label} className="grid grid-cols-2 gap-1 rounded-full border border-white/10 bg-field p-1">
        {props.options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={props.value === v}
            onClick={() => props.onChange(v)}
            className={`press rounded-full px-3 py-1.5 text-sm transition-colors ${props.value === v ? "bg-gold text-black font-semibold" : "text-neutral-300 hover:text-white"}`}
          >
            {text}
          </button>
        ))}
      </div>
      {props.hint && <p className="mt-1.5 text-xs text-neutral-500">{props.hint}</p>}
    </div>
  );
}

function AddressFields({ value, onChange }: { value: Address; onChange: (a: Address) => void }) {
  const set = (k: keyof Address) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="grid grid-cols-6 gap-2">
      <input className="field col-span-2" placeholder="CEP" value={value.cep} onChange={set("cep")} aria-label="CEP" inputMode="numeric" />
      <input className="field col-span-4" placeholder="Rua" value={value.rua} onChange={set("rua")} aria-label="Rua" />
      <input className="field col-span-2" placeholder="Número" value={value.numero} onChange={set("numero")} aria-label="Número" />
      <input className="field col-span-4" placeholder="Complemento" value={value.complemento ?? ""} onChange={set("complemento")} aria-label="Complemento" />
      <input className="field col-span-3" placeholder="Bairro" value={value.bairro} onChange={set("bairro")} aria-label="Bairro" />
      <input className="field col-span-2" placeholder="Cidade" value={value.cidade} onChange={set("cidade")} aria-label="Cidade" />
      <input className="field col-span-1" placeholder="UF" value={value.estado} onChange={set("estado")} aria-label="Estado" maxLength={2} />
    </div>
  );
}
