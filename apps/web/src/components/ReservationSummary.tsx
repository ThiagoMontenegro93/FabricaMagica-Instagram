import { formatBRL, formatDateBR } from "@fabrica/shared";
import type { ReservationDTO } from "@/lib/reservation-types";
import { ThemeCover } from "./ThemeCard";

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

/** Itens, datas e valores de uma reserva: usado pelo cliente e pela equipe. */
export function ReservationSummary({ r }: { r: ReservationDTO }) {
  const rent = r.dealType === "ALUGUEL";
  const a = r.deliveryAddress;
  return (
    <div className="space-y-6">
      <dl className="grid gap-4 text-sm sm:grid-cols-3">
        <Info label={rent ? "Festa" : "Entrega"} value={formatDateBR(r.eventDate)} />
        {rent && r.themes.length > 0 && <Info label="Devolução" value={formatDateBR(r.returnDate)} />}
        {r.themes.length > 0 && (
          <Info label="Transporte" value={r.deliveryType === "ENTREGA" ? "A loja entrega" : "Cliente retira na loja"} />
        )}
      </dl>
      {a && r.deliveryType === "ENTREGA" && (
        <p className="rounded-lg border border-white/10 bg-field px-3 py-2 text-sm text-neutral-300">
          <span className="block text-xs text-neutral-500">Endereço de entrega</span>
          {a.rua}, {a.numero}
          {a.complemento ? ` ${a.complemento}` : ""} · {a.bairro}, {a.cidade}/{a.estado} · CEP {a.cep}
        </p>
      )}

      <ul className="divide-y divide-white/5">
        {r.themes.map((t) => (
          <li key={t.id} className="flex items-center gap-3 py-3">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg">
              <ThemeCover name={t.theme.name} photos={t.theme.photos} compact />
            </div>
            <div className="flex-1">
              <p className="text-white">{t.theme.name}{t.quantity > 1 && <span className="text-neutral-400"> × {t.quantity}</span>}</p>
              <p className="text-xs text-neutral-500">{rent ? "Aluguel" : "Compra"}</p>
            </div>
            <p className="tabular-nums text-neutral-200">{formatBRL(t.unitPrice * t.quantity)}</p>
          </li>
        ))}
        {r.characters.map((c) => (
          <li key={c.id} className="flex items-center gap-3 py-3">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#3a0020] to-[#FF00A8] font-serif text-2xl">
              {c.character.name.charAt(0)}
            </div>
            <div className="flex-1">
              <p className="text-white">{c.character.name}</p>
              <p className="text-xs text-neutral-500">Chega às {time(c.startsAt)} · {2 + c.extraHours}h de festa</p>
            </div>
            <p className="tabular-nums text-neutral-200">{formatBRL(c.price)}</p>
          </li>
        ))}
      </ul>

      <div className="space-y-1.5 border-t border-white/5 pt-4 text-sm">
        <Row label="Subtotal" value={r.subtotal} />
        {r.weekendFee > 0 && <Row label="Taxa de fim de semana" value={r.weekendFee} />}
        {r.themes.length > 0 && <Row label="Frete" value={r.deliveryFee} zero={r.deliveryType === "RETIRADA" ? "Cliente retira" : "Grátis"} />}
        {r.lateFee > 0 && <Row label="Multa por atraso" value={r.lateFee} />}
        {r.damageFee > 0 && <Row label="Avarias" value={r.damageFee} />}
        <p className="flex items-baseline justify-between pt-2">
          <span className="font-semibold text-white">Total</span>
          <span className="font-serif text-3xl text-gold">{formatBRL(r.totalPrice)}</span>
        </p>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-neutral-500">{label}</dt>
      <dd className="mt-0.5 text-white">{value}</dd>
    </div>
  );
}

function Row({ label, value, zero }: { label: string; value: number; zero?: string }) {
  return (
    <p className="flex justify-between text-neutral-300">
      <span>{label}</span>
      <span className="tabular-nums">{value > 0 ? formatBRL(value) : (zero ?? formatBRL(0))}</span>
    </p>
  );
}
