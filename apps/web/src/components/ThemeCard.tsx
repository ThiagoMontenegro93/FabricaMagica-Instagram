import Link from "next/link";
import { formatBRL, type ResolvedOffer } from "@fabrica/shared";

export interface ThemeCardData {
  slug: string;
  name: string;
  category: string;
  dailyPrice: number;
  photos: string[];
  status: string;
  isBestseller: boolean;
  isNew: boolean;
  availableQty: number | null;
  offer: ResolvedOffer;
}

/** Brilho de fundo por tema: tons escuros e saturados, sem competir com o ouro. */
const GLOWS = ["157,0,255", "255,0,168", "0,180,110", "212,140,30", "90,60,255"];

function hash(text: string) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** Capa do tema: a primeira foto ou, sem foto, uma capa de ateliê com monograma em ouro. */
export function ThemeCover({ name, photos, className = "", compact = false }: { name: string; photos: string[]; className?: string; compact?: boolean }) {
  if (photos[0]) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photos[0]} alt={name} className={`h-full w-full object-cover ${className}`} loading="lazy" />;
  }
  const glow = GLOWS[hash(name) % GLOWS.length];
  const initial = name.replace(/^(O|A|Os|As) /, "").charAt(0);
  return (
    <div
      role="img"
      aria-label={name}
      className={`relative flex h-full w-full items-center justify-center bg-[#0b0b0b] ${className}`}
      style={{
        backgroundImage: `radial-gradient(70% 60% at 50% 40%, rgba(${glow},0.38), transparent 70%), radial-gradient(120% 80% at 50% 120%, rgba(${glow},0.22), transparent 60%)`,
      }}
    >
      {!compact && <div className="absolute inset-4 rounded-xl border border-gold/25" aria-hidden />}
      {!compact && <div className="absolute inset-[22px] rounded-lg border border-gold/10" aria-hidden />}
      <span
        aria-hidden
        className={`bg-gradient-to-b from-[#f6e3a1] via-gold to-[#8a6a12] bg-clip-text font-serif italic ${compact ? "text-2xl" : "text-7xl"} text-transparent drop-shadow-[0_4px_24px_rgba(212,175,55,0.25)]`}
      >
        {initial}
      </span>
      {!compact && (
        <span aria-hidden className="absolute bottom-7 text-[10px] uppercase tracking-[0.35em] text-gold/50">
          Fábrica Mágica
        </span>
      )}
    </div>
  );
}

export function ThemeCard({ theme, date }: { theme: ThemeCardData; date?: string }) {
  const rents = theme.offer.deals.includes("ALUGUEL");
  const sells = theme.offer.deals.includes("VENDA");
  const soldOut = rents && theme.availableQty === 0;
  const href = `/temas/${theme.slug}${date ? `?data=${date}` : ""}`;
  return (
    <Link href={href} className="card group block overflow-hidden p-0 transition-[border-color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-gold/50">
      <div className="relative aspect-[4/3] overflow-hidden rounded-t-2xl sm:aspect-square">
        <ThemeCover name={theme.name} photos={theme.photos} className="transition-transform duration-500 ease-out group-hover:scale-[1.03]" />
        <div className="absolute left-3 top-3 flex gap-2">
          {theme.isBestseller && <span className="rounded-full bg-gold px-2 py-0.5 text-xs font-semibold text-black">Mais alugado</span>}
          {theme.isNew && <span className="rounded-full bg-neon-pink px-2 py-0.5 text-xs font-semibold text-black">Lançamento</span>}
          {sells && <span className="rounded-full bg-neon-green px-2 py-0.5 text-xs font-semibold text-black">À venda</span>}
        </div>
        {theme.status === "MANUTENCAO" && (
          <span className="absolute bottom-3 left-3 rounded-full bg-black/80 px-2 py-0.5 text-xs text-neutral-300">Em manutenção</span>
        )}
      </div>
      <div className="space-y-1 p-4">
        <p className="text-xs uppercase tracking-wider text-neutral-500">{theme.category}</p>
        <p className="font-serif text-xl text-white">{theme.name}</p>
        <div className="flex items-center justify-between">
          <div>
            {rents && <p className="text-gold">{formatBRL(theme.dailyPrice)} <span className="text-xs text-neutral-500">/ diária</span></p>}
            {sells && (
              <p className={rents ? "text-sm text-neutral-300" : "text-gold"}>
                {formatBRL(theme.offer.salePrice ?? 0)} <span className="text-xs text-neutral-500">para comprar</span>
              </p>
            )}
            {!rents && !sells && <p className="text-sm text-neutral-400">Sob consulta</p>}
          </div>
          {rents && theme.availableQty !== null && (
            <span className={`text-xs ${soldOut ? "text-red-300" : "text-neon-green"}`}>
              {soldOut ? "Indisponível na data" : "Disponível"}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
