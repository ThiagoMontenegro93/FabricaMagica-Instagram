import { CHARACTER_BASE_MINUTES } from "./constants";
import { isWeekendRate } from "./dates";

/** Todos os valores em centavos (85000 = R$ 850,00). */
export interface ThemeLine {
  dailyPrice: number;
  quantity: number;
  /** Multiplicador do tema; se ausente usa o do tenant (RN07). */
  weekendMultiplier?: number | null;
}

export interface CharacterLine {
  pricePer2h: number;
  priceExtraHour: number;
  extraHours: number;
}

export interface QuoteInput {
  eventDate: string; // YYYY-MM-DD
  themes: ThemeLine[];
  characters: CharacterLine[];
  deliveryFee: number;
  tenantWeekendMultiplier: number;
}

export interface Quote {
  themesSubtotal: number;
  charactersSubtotal: number;
  subtotal: number;
  weekendFee: number;
  deliveryFee: number;
  total: number;
  isWeekend: boolean;
}

function assertCents(name: string, v: number) {
  if (!Number.isInteger(v) || v < 0) throw new Error(`${name} deve ser inteiro >= 0 (centavos)`);
}

export function characterPrice(line: CharacterLine): number {
  assertCents("pricePer2h", line.pricePer2h);
  assertCents("priceExtraHour", line.priceExtraHour);
  assertCents("extraHours", line.extraHours);
  return line.pricePer2h + line.priceExtraHour * line.extraHours;
}

/** Duração total de um personagem em minutos (2h base + horas extras). */
export function characterDurationMinutes(extraHours: number): number {
  return CHARACTER_BASE_MINUTES + extraHours * 60;
}

/**
 * RF04: total = sum(temas) + sum(personagens) + taxa entrega + taxa fds.
 * A taxa de fim de semana incide sobre os temas (aluguel diário).
 * Personagens são cobrados por hora e não recebem o multiplicador.
 */
export function calculateQuote(input: QuoteInput): Quote {
  assertCents("deliveryFee", input.deliveryFee);
  const isWeekend = isWeekendRate(input.eventDate);

  let themesSubtotal = 0;
  let weekendFee = 0;
  for (const t of input.themes) {
    assertCents("dailyPrice", t.dailyPrice);
    if (!Number.isInteger(t.quantity) || t.quantity < 1) throw new Error("quantity deve ser >= 1");
    const base = t.dailyPrice * t.quantity;
    themesSubtotal += base;
    if (isWeekend) {
      const multiplier = t.weekendMultiplier ?? input.tenantWeekendMultiplier;
      weekendFee += Math.round(base * (multiplier - 1));
    }
  }

  const charactersSubtotal = input.characters.reduce((acc, c) => acc + characterPrice(c), 0);
  const subtotal = themesSubtotal + charactersSubtotal;
  return {
    themesSubtotal,
    charactersSubtotal,
    subtotal,
    weekendFee,
    deliveryFee: input.deliveryFee,
    total: subtotal + weekendFee + input.deliveryFee,
    isWeekend,
  };
}

export function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}
