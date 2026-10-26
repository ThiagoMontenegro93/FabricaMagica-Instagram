"use client";

import { useState } from "react";
import {
  calculateQuote,
  formatBRL,
  whatsappLink,
  type DealType,
  type DeliveryType,
  type ResolvedOffer,
} from "@fabrica/shared";

interface Props {
  themeName: string;
  dailyPrice: number;
  weekendMultiplier: number;
  offer: ResolvedOffer;
  /** Data da festa (YYYY-MM-DD) quando o cliente já escolheu. */
  date?: string;
  /** Kits livres para aluguel na data; null se a data não foi escolhida. */
  availableForRent: number | null;
  whatsapp: string;
}

const DEAL_LABEL: Record<DealType, string> = { ALUGUEL: "Alugar", VENDA: "Comprar" };
const DELIVERY_LABEL: Record<DeliveryType, { title: string; hint: string }> = {
  RETIRADA: { title: "Retiro na loja", hint: "Transporte por minha conta, sem frete" },
  ENTREGA: { title: "A loja entrega", hint: "Equipe leva e monta, com frete" },
};

/** Escolha de Alugar/Comprar e Retirar/Receber, com o total na hora. */
export function OfferPicker({ themeName, dailyPrice, weekendMultiplier, offer, date, availableForRent, whatsapp }: Props) {
  const [deal, setDeal] = useState<DealType>(offer.deals[0] ?? "ALUGUEL");
  const [delivery, setDelivery] = useState<DeliveryType>(offer.deliveryTypes.includes("ENTREGA") ? "ENTREGA" : offer.deliveryTypes[0]!);

  if (offer.deals.length === 0) {
    return (
      <div className="card space-y-3">
        <p className="text-neutral-300">Valores sob consulta.</p>
        <a className="btn-gold" href={whatsappLink(`Olá! Quero saber do tema ${themeName}.`, whatsapp)} target="_blank" rel="noopener noreferrer">
          Consultar pelo WhatsApp
        </a>
      </div>
    );
  }

  // Sem data, o aluguel é cotado num dia útil (sem taxa extra).
  const quote = calculateQuote({
    eventDate: date ?? "2026-01-06",
    themes: [{ dailyPrice, quantity: 1, weekendMultiplier, salePrice: offer.salePrice }],
    characters: [],
    deliveryFee: offer.deliveryFee,
    tenantWeekendMultiplier: weekendMultiplier,
    dealType: deal,
    deliveryType: delivery,
  });
  const soldOut = deal === "VENDA" ? offer.saleQty < 1 : availableForRent === 0;
  const dateBR = date?.split("-").reverse().join("/");
  const msg =
    deal === "VENDA"
      ? `Olá! Quero comprar o tema ${themeName} (${DELIVERY_LABEL[delivery].title.toLowerCase()}). Total: ${formatBRL(quote.total)}.`
      : `Olá! Quero alugar o tema ${themeName}${dateBR ? ` para ${dateBR}` : ""} (${DELIVERY_LABEL[delivery].title.toLowerCase()}). Total: ${formatBRL(quote.total)}.`;

  const pill = (active: boolean) =>
    `flex-1 rounded-xl border px-3 py-2 text-left text-sm transition ${active ? "border-gold bg-gold/10 text-white" : "border-white/10 text-neutral-400 hover:border-gold/50"}`;

  return (
    <div className="card space-y-4">
      {offer.deals.length > 1 && (
        <div role="radiogroup" aria-label="Alugar ou comprar" className="flex gap-2">
          {offer.deals.map((d) => (
            <button key={d} type="button" role="radio" aria-checked={deal === d} className={pill(deal === d)} onClick={() => setDeal(d)}>
              <span className="block font-semibold">{DEAL_LABEL[d]}</span>
              <span className="text-xs text-neutral-400">
                {d === "VENDA" ? `${formatBRL(offer.salePrice ?? 0)} (é seu)` : `${formatBRL(dailyPrice)} / diária`}
              </span>
            </button>
          ))}
        </div>
      )}

      <p className="text-3xl text-gold">
        {deal === "VENDA" ? formatBRL(offer.salePrice ?? 0) : formatBRL(dailyPrice)}{" "}
        <span className="text-sm text-neutral-500">{deal === "VENDA" ? "compra" : "/ diária"}</span>
      </p>
      {deal === "ALUGUEL" && weekendMultiplier > 1 && (
        <p className="text-xs text-neutral-500">
          Sexta e sábado: +{Math.round((weekendMultiplier - 1) * 100)}%{quote.isWeekend ? " (já aplicado na data escolhida)" : ""}.
        </p>
      )}

      <div role="radiogroup" aria-label="Forma de entrega" className="flex gap-2">
        {offer.deliveryTypes.map((d) => (
          <button key={d} type="button" role="radio" aria-checked={delivery === d} className={pill(delivery === d)} onClick={() => setDelivery(d)}>
            <span className="block font-semibold">{DELIVERY_LABEL[d].title}</span>
            <span className="text-xs text-neutral-400">
              {d === "ENTREGA" && offer.deliveryFee > 0 ? `Frete ${formatBRL(offer.deliveryFee)}` : DELIVERY_LABEL[d].hint}
            </span>
          </button>
        ))}
      </div>

      <div className="space-y-1 border-t border-white/5 pt-3 text-sm">
        <p className="flex justify-between text-neutral-300">
          <span>{deal === "VENDA" ? "Tema (compra)" : "Diária do tema"}</span>
          <span>{formatBRL(quote.themesSubtotal)}</span>
        </p>
        {quote.weekendFee > 0 && (
          <p className="flex justify-between text-neutral-300">
            <span>Taxa extra de fim de semana</span>
            <span>{formatBRL(quote.weekendFee)}</span>
          </p>
        )}
        <p className="flex justify-between text-neutral-300">
          <span>{delivery === "ENTREGA" ? "Frete (a loja entrega)" : "Frete (você retira)"}</span>
          <span>{quote.deliveryFee > 0 ? formatBRL(quote.deliveryFee) : "Grátis"}</span>
        </p>
        <p className="flex justify-between font-semibold text-white">
          <span>Total</span>
          <span className="text-gold" data-testid="total">{formatBRL(quote.total)}</span>
        </p>
      </div>

      {soldOut ? (
        <p className="text-red-300">
          {deal === "VENDA" ? "Sem unidades à venda no momento." : "Já reservado nesta data. Veja outros temas ou fale com a gente."}
        </p>
      ) : (
        deal === "ALUGUEL" && availableForRent !== null && <p className="text-neon-green">Disponível nesta data.</p>
      )}

      <a className="btn-gold w-full justify-center" href={whatsappLink(msg, whatsapp)} target="_blank" rel="noopener noreferrer">
        {deal === "VENDA" ? "Quero comprar pelo WhatsApp" : "Quero reservar pelo WhatsApp"}
      </a>
    </div>
  );
}
