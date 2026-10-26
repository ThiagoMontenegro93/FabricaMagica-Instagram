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

const GRADIENTS = [
  "from-[#2a0045] to-[#9D00FF]",
  "from-[#3a0020] to-[#FF00A8]",
  "from-[#002a1a] to-[#00FF88]",
  "from-[#3a2a00] to-[#FFD700]",
];

/** Capa do tema: a primeira foto ou, sem foto, um degradê neon com a inicial. */
export function ThemeCover({ name, photos, className = "" }: { name: string; photos: string[]; className?: string }) {
  if (photos[0]) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photos[0]} alt={name} className={`h-full w-full object-cover ${className}`} loading="lazy" />;
  }
  const g = GRADIENTS[name.length % GRADIENTS.length];
  return (
    <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${g} ${className}`}>
      <span className="font-serif text-6xl text-white/90">{name.replace(/^(O|A|Os|As) /, "").charAt(0)}</span>
    </div>
  );
}

export function ThemeCard({ theme, date }: { theme: ThemeCardData; date?: string }) {
  const rents = theme.offer.deals.includes("ALUGUEL");
  const sells = theme.offer.deals.includes("VENDA");
  const soldOut = rents && theme.availableQty === 0;
  const href = `/temas/${theme.slug}${date ? `?data=${date}` : ""}`;
  return (
    <Link href={href} className="card group block overflow-hidden p-0 transition hover:border-gold/50">
      <div className="relative aspect-square overflow-hidden rounded-t-2xl">
        <ThemeCover name={theme.name} photos={theme.photos} className="transition duration-500 group-hover:scale-105" />
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
