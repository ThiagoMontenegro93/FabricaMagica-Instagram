import Link from "next/link";
import { notFound } from "next/navigation";
import { formatBRL, isValidIsoDate, isWeekendRate, whatsappLink } from "@fabrica/shared";
import { ThemeCover } from "@/components/ThemeCard";
import { currentTenant } from "@/server/tenant";
import { getTheme, themeAvailability } from "@/server/services/theme.service";
import { AppError } from "@/server/errors";

export const dynamic = "force-dynamic";

export default async function ThemePage({ params, searchParams }: { params: { slug: string }; searchParams: { data?: string } }) {
  const tenant = await currentTenant();
  let theme;
  try {
    theme = await getTheme(tenant.id, params.slug);
  } catch (err) {
    if (err instanceof AppError && err.status === 404) notFound();
    throw err;
  }

  const date = searchParams.data && isValidIsoDate(searchParams.data) ? searchParams.data : undefined;
  const available = date ? (await themeAvailability([theme], { eventDate: date, returnDate: date })).get(theme.id) ?? 0 : null;
  const multiplier = theme.weekendMultiplier ?? tenant.settings.weekendMultiplier;
  const weekend = date ? isWeekendRate(date) : false;
  const price = weekend ? Math.round(theme.dailyPrice * multiplier) : theme.dailyPrice;
  const deliveryFee = tenant.settings.deliveryFeeBase;
  const msg = `Olá! Quero reservar o tema ${theme.name}${date ? ` para ${date.split("-").reverse().join("/")}` : ""}.`;

  return (
    <article className="grid gap-10 lg:grid-cols-2">
      <div className="space-y-3">
        <div className="neon-frame aspect-square overflow-hidden">
          <ThemeCover name={theme.name} photos={theme.photos} />
        </div>
        {theme.photos.length > 1 && (
          <ul className="grid grid-cols-4 gap-2">
            {theme.photos.slice(1, 9).map((p) => (
              <li key={p} className="aspect-square overflow-hidden rounded-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p} alt={theme.name} className="h-full w-full object-cover" loading="lazy" />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-6">
        <Link href="/#temas" className="text-sm text-neutral-400 hover:text-gold">← Todos os temas</Link>
        <div>
          <p className="text-xs uppercase tracking-wider text-neutral-500">{theme.category}</p>
          <h1 className="font-serif text-5xl text-white">{theme.name}</h1>
        </div>
        <p className="text-neutral-300">{theme.description}</p>

        <div className="card space-y-2">
          <p className="text-3xl text-gold">{formatBRL(price)} <span className="text-sm text-neutral-500">/ diária</span></p>
          <p className="text-xs text-neutral-500">
            Sexta e sábado: +{Math.round((multiplier - 1) * 100)}%{weekend ? " (já aplicado na data escolhida)" : ""}.
          </p>
          {deliveryFee > 0 && (
            <div className="space-y-1 border-t border-white/5 pt-2 text-sm">
              <p className="flex justify-between text-neutral-300">
                <span>Frete (entrega e retirada)</span>
                <span>{formatBRL(deliveryFee)}</span>
              </p>
              <p className="flex justify-between font-semibold text-white">
                <span>Total com frete</span>
                <span className="text-gold">{formatBRL(price + deliveryFee)}</span>
              </p>
            </div>
          )}
          <form className="flex items-end gap-2 pt-2">
            <div>
              <label className="label" htmlFor="data">Data da festa</label>
              <input id="data" name="data" type="date" defaultValue={date} className="field" />
            </div>
            <button className="btn-ghost">Ver disponibilidade</button>
          </form>
          {available !== null && (
            <p className={available > 0 ? "text-neon-green" : "text-red-300"}>
              {theme.status === "MANUTENCAO"
                ? "Tema em manutenção nesta data."
                : available > 0
                  ? "Disponível nesta data."
                  : "Já reservado nesta data. Veja outros temas ou fale com a gente."}
            </p>
          )}
        </div>

        {theme.includedItems.length > 0 && (
          <div>
            <h2 className="font-serif text-2xl text-white">O que vem no tema</h2>
            <ul className="mt-2 list-inside list-disc space-y-1 text-neutral-300">
              {theme.includedItems.map((i) => <li key={i}>{i}</li>)}
            </ul>
          </div>
        )}

        <a className="btn-gold" href={whatsappLink(msg, tenant.whatsapp)} target="_blank" rel="noopener noreferrer">
          Quero reservar pelo WhatsApp
        </a>
        <p className="text-xs text-neutral-500">A reserva com pagamento online chega na próxima etapa.</p>
      </div>
    </article>
  );
}
