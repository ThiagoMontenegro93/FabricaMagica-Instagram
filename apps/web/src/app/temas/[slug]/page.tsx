import Link from "next/link";
import { notFound } from "next/navigation";
import { isValidIsoDate } from "@fabrica/shared";
import { Gallery } from "@/components/Gallery";
import { OfferPicker } from "@/components/OfferPicker";
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
  const rents = theme.offer.deals.includes("ALUGUEL");

  return (
    <article className="grid gap-10 lg:grid-cols-2">
      <Gallery name={theme.name} photos={theme.photos} videoUrl={theme.videoUrl} gifUrl={theme.gifUrl} />

      <div className="space-y-6">
        <Link href="/#temas" className="text-sm text-neutral-400 hover:text-gold">← Todos os temas</Link>
        <div>
          <p className="text-xs uppercase tracking-wider text-neutral-500">{theme.category}</p>
          <h1 className="font-serif text-5xl text-white">{theme.name}</h1>
        </div>
        <p className="text-neutral-300">{theme.description}</p>

        {theme.status === "MANUTENCAO" && <p className="text-amber-300">Tema em manutenção no momento.</p>}

        {rents && (
          <form className="flex items-end gap-2">
            <div>
              <label className="label" htmlFor="data">Data da festa</label>
              <input id="data" name="data" type="date" defaultValue={date} className="field" />
            </div>
            <button className="btn-ghost">Ver disponibilidade</button>
          </form>
        )}

        <OfferPicker
          themeName={theme.name}
          dailyPrice={theme.dailyPrice}
          weekendMultiplier={multiplier}
          offer={theme.offer}
          date={date}
          availableForRent={available}
          whatsapp={tenant.whatsapp}
        />

        {theme.includedItems.length > 0 && (
          <div>
            <h2 className="font-serif text-2xl text-white">O que vem no tema</h2>
            <ul className="mt-2 list-inside list-disc space-y-1 text-neutral-300">
              {theme.includedItems.map((i) => <li key={i}>{i}</li>)}
            </ul>
          </div>
        )}

        <p className="text-xs text-neutral-500">O pagamento online (Pix e cartão) chega na próxima etapa.</p>
      </div>
    </article>
  );
}
