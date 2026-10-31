"use client";

import { useSyncExternalStore } from "react";
import type { DealType, DeliveryType } from "@fabrica/shared";

export interface CartTheme {
  themeId: string;
  slug: string;
  name: string;
  photo: string | null;
  dailyPrice: number;
  salePrice: number | null;
  quantity: number;
}

export interface CartCharacter {
  /** Chave local: o mesmo personagem pode entrar em dois horários. */
  key: string;
  characterId: string;
  name: string;
  pricePer2h: number;
  priceExtraHour: number;
  time: string; // "15:00"
  extraHours: number;
}

export interface Cart {
  dealType: DealType;
  deliveryType: DeliveryType;
  eventDate: string;
  returnDate: string;
  themes: CartTheme[];
  characters: CartCharacter[];
}

const KEY = "fm_cart_v1";
const EMPTY: Cart = { dealType: "ALUGUEL", deliveryType: "ENTREGA", eventDate: "", returnDate: "", themes: [], characters: [] };

let cache: Cart | null = null;
const listeners = new Set<() => void>();

function read(): Cart {
  if (cache) return cache;
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
    cache = raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Cart>) } : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}

function write(next: Cart) {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Navegação privada: o carrinho vale só nesta aba.
  }
  listeners.forEach((l) => l());
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      cache = null;
      listeners.forEach((l) => l());
    }
  });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useCart(): Cart {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function cartCount(c: Cart) {
  return c.themes.reduce((a, t) => a + t.quantity, 0) + c.characters.length;
}

export const cart = {
  get: read,
  update(patch: Partial<Cart>) {
    write({ ...read(), ...patch });
  },
  /** Aluguel e venda não se misturam: trocar o tipo pede para começar outro carrinho. */
  addTheme(item: Omit<CartTheme, "quantity">, dealType: DealType, deliveryType: DeliveryType, eventDate?: string) {
    const c = read();
    const sameDeal = c.dealType === dealType || (c.themes.length === 0 && c.characters.length === 0);
    const base = sameDeal ? c : { ...EMPTY };
    const exists = base.themes.find((t) => t.themeId === item.themeId);
    const themes = exists
      ? base.themes.map((t) => (t.themeId === item.themeId ? { ...t, quantity: Math.min(t.quantity + 1, 20) } : t))
      : [...base.themes, { ...item, quantity: 1 }];
    write({
      ...base,
      dealType,
      deliveryType,
      themes,
      eventDate: eventDate || base.eventDate,
      returnDate: eventDate && !base.returnDate ? eventDate : base.returnDate,
    });
    return { replaced: !sameDeal };
  },
  setQuantity(themeId: string, quantity: number) {
    const c = read();
    write({
      ...c,
      themes: quantity < 1 ? c.themes.filter((t) => t.themeId !== themeId) : c.themes.map((t) => (t.themeId === themeId ? { ...t, quantity: Math.min(quantity, 20) } : t)),
    });
  },
  addCharacter(item: Omit<CartCharacter, "key" | "time" | "extraHours">) {
    const c = read();
    const base = c.dealType === "VENDA" && c.themes.length > 0 ? null : c;
    if (!base) return { ok: false as const };
    write({
      ...base,
      dealType: "ALUGUEL",
      characters: [...base.characters, { ...item, key: `${item.characterId}-${Date.now()}`, time: "15:00", extraHours: 0 }],
    });
    return { ok: true as const };
  },
  updateCharacter(key: string, patch: Partial<Pick<CartCharacter, "time" | "extraHours">>) {
    const c = read();
    write({ ...c, characters: c.characters.map((x) => (x.key === key ? { ...x, ...patch } : x)) });
  },
  removeCharacter(key: string) {
    const c = read();
    write({ ...c, characters: c.characters.filter((x) => x.key !== key) });
  },
  clear() {
    write(EMPTY);
  },
};
