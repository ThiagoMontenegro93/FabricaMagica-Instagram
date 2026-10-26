import Link from "next/link";
import { FABRICA_MAGICA, formatBRL, isValidIsoDate, whatsappLink } from "@fabrica/shared";
import { Logo } from "@/components/Logo";
import { ThemeCard } from "@/components/ThemeCard";
import { currentTenant } from "@/server/tenant";
import { listThemes } from "@/server/services/theme.service";
import { listCharacters } from "@/server/services/character.service";

export const dynamic = "force-dynamic";

function deliveryNote(s: { allowPickup: boolean; allowDelivery: boolean; deliveryFeeBase: number }) {
  const fee = s.deliveryFeeBase > 0 ? ` por ${formatBRL(s.deliveryFeeBase)} de frete` : "";
  if (s.allowPickup && s.allowDelivery) return ` Retire na loja sem frete ou receba com a nossa equipe${fee}.`;
  if (s.allowDelivery) return ` A nossa equipe entrega e monta${fee}.`;
  return " Retirada na loja, transporte por conta do cliente.";
}

export default async function Home({ searchParams }: { searchParams: { categoria?: string; data?: string; q?: string; tipo?: string } }) {
  const tenant = await currentTenant();
  const date = searchParams.data && isValidIsoDate(searchParams.data) ? searchParams.data : undefined;
  const tipo = searchParams.tipo === "aluguel" || searchParams.tipo === "venda" ? searchParams.tipo : undefined;
  const [catalog, characters] = await Promise.all([
    listThemes(tenant.id, { category: searchParams.categoria, availableOn: date, q: searchParams.q, tipo }),
    listCharacters(tenant.id),
  ]);
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { categoria: searchParams.categoria, data: date, q: searchParams.q, tipo, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/?${s}#temas` : "/#temas";
  };

  return (
    <div className="space-y-16">
      <section className="neon-frame flex flex-col items-center gap-6 bg-gradient-to-b from-black to-[#12001f] px-6 py-16 text-center">
        <p className="text-xs uppercase tracking-[0.4em] text-neutral-400">Atelier de Festas Sombrias</p>
        <Logo size="lg" />
        <p className="font-serif text-2xl text-gold md:text-3xl">{FABRICA_MAGICA.slogan}</p>
        <p className="max-w-xl text-neutral-300">
          Temas de festa, Halloween de luxo, balões e personagens vivos no Rio de Janeiro.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <a href="#temas" className="btn-gold">Ver temas</a>
          <a href={whatsappLink("Olá! Quero saber dos temas disponíveis.")} className="btn-ghost" target="_blank" rel="noopener noreferrer">
            Falar no WhatsApp
          </a>
        </div>
      </section>

      <section id="temas" className="scroll-mt-6 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-serif text-3xl text-white">Temas</h2>
            <p className="text-sm text-neutral-400">
              Escolha a data da festa para ver o que está livre.
              {deliveryNote(tenant.settings)}
            </p>
          </div>
          <form className="flex flex-wrap items-end gap-2" action="/#temas">
            {searchParams.categoria && <input type="hidden" name="categoria" value={searchParams.categoria} />}
            {tipo && <input type="hidden" name="tipo" value={tipo} />}
            <div>
              <label className="label" htmlFor="q">Buscar</label>
              <input id="q" name="q" defaultValue={searchParams.q} placeholder="Ex.: Mickey" className="field w-40" />
            </div>
            <div>
              <label className="label" htmlFor="data">Data da festa</label>
              <input id="data" name="data" type="date" defaultValue={date} className="field" />
            </div>
            <button className="btn-gold">Filtrar</button>
          </form>
        </div>

        <nav className="flex flex-wrap gap-2" aria-label="Alugar ou comprar">
          {([
            [undefined, "Alugar e comprar"],
            ["aluguel", "Para alugar"],
            ["venda", "À venda"],
          ] as const).map(([value, label]) => (
            <Link
              key={label}
              href={qs({ tipo: value })}
              className={`rounded-full border px-4 py-1.5 text-sm ${tipo === value ? "border-neon-purple bg-neon-purple/20 text-white" : "border-white/10 text-neutral-300 hover:border-neon-purple/60"}`}
            >
              {label}
            </Link>
          ))}
        </nav>

        <nav className="flex flex-wrap gap-2" aria-label="Categorias">
          <Link href={qs({ categoria: undefined })} className={`rounded-full border px-4 py-1.5 text-sm ${!searchParams.categoria ? "border-gold text-gold" : "border-white/10 text-neutral-300 hover:border-gold/50"}`}>
            Todos
          </Link>
          {catalog.categories.map((c) => (
            <Link
              key={c.name}
              href={qs({ categoria: c.name })}
              className={`rounded-full border px-4 py-1.5 text-sm ${searchParams.categoria?.toLowerCase() === c.name.toLowerCase() ? "border-gold text-gold" : "border-white/10 text-neutral-300 hover:border-gold/50"}`}
            >
              {c.name} <span className="text-neutral-500">({c.count})</span>
            </Link>
          ))}
        </nav>

        {catalog.items.length === 0 ? (
          <p className="card text-neutral-400">Nenhum tema encontrado com esses filtros.</p>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {catalog.items.map((t) => (
              <li key={t.id}><ThemeCard theme={t} date={date} /></li>
            ))}
          </ul>
        )}
      </section>

      {characters.length > 0 && (
        <section className="space-y-6">
          <h2 className="font-serif text-3xl text-white">Personagens vivos</h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {characters.map((c) => (
              <li key={c.id} className="card text-center">
                <p className="font-serif text-xl text-white">{c.name}</p>
                <p className="mt-1 text-gold">{formatBRL(c.pricePer2h)} <span className="text-xs text-neutral-500">/ 2h</span></p>
                <p className="text-xs text-neutral-500">+{formatBRL(c.priceExtraHour)} por hora extra</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
