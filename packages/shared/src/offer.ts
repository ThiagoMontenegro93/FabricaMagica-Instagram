import type { DealType, DeliveryType, OfferMode } from "./constants";

/** Padrões da loja (TenantSettings). */
export interface OfferDefaults {
  defaultOfferMode: OfferMode;
  allowPickup: boolean;
  allowDelivery: boolean;
  deliveryFeeBase: number;
}

/** Campos do tema que podem sobrescrever os padrões (null = usa o da loja). */
export interface ThemeOfferFields {
  offerMode?: OfferMode | null;
  salePrice?: number | null;
  saleQty?: number | null;
  allowPickup?: boolean | null;
  allowDelivery?: boolean | null;
  deliveryFee?: number | null;
}

export interface ResolvedOffer {
  offerMode: OfferMode;
  /** Negócios que o cliente pode fazer agora (venda sai se não há preço). */
  deals: DealType[];
  deliveryTypes: DeliveryType[];
  /** Frete cobrado quando a loja entrega (centavos). */
  deliveryFee: number;
  salePrice: number | null;
  saleQty: number;
}

/**
 * Junta os padrões da loja com o que o dono definiu no tema.
 * Venda só aparece com preço de venda; sem nenhuma forma de entrega válida,
 * a retirada fica liberada para o tema não sumir do site.
 */
export function resolveOffer(theme: ThemeOfferFields, defaults: OfferDefaults): ResolvedOffer {
  const offerMode = theme.offerMode ?? defaults.defaultOfferMode;
  const salePrice = theme.salePrice ?? null;
  const deals: DealType[] = [];
  if (offerMode !== "VENDA") deals.push("ALUGUEL");
  if (offerMode !== "ALUGUEL" && salePrice !== null) deals.push("VENDA");

  const pickup = theme.allowPickup ?? defaults.allowPickup;
  const delivery = theme.allowDelivery ?? defaults.allowDelivery;
  const deliveryTypes: DeliveryType[] = [];
  if (pickup) deliveryTypes.push("RETIRADA");
  if (delivery) deliveryTypes.push("ENTREGA");
  if (deliveryTypes.length === 0) deliveryTypes.push("RETIRADA");

  return {
    offerMode,
    deals,
    deliveryTypes,
    deliveryFee: theme.deliveryFee ?? defaults.deliveryFeeBase,
    salePrice,
    saleQty: theme.saleQty ?? 0,
  };
}
