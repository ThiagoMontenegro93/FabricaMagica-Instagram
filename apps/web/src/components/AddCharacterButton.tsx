"use client";

import Link from "next/link";
import { useState } from "react";
import { cart } from "@/lib/cart";

export function AddCharacterButton(props: { characterId: string; name: string; pricePer2h: number; priceExtraHour: number }) {
  const [state, setState] = useState<"idle" | "added" | "blocked">("idle");
  if (state === "added") {
    return (
      <Link href="/carrinho" className="pop-in mt-4 inline-flex text-sm font-semibold text-neon-green underline-offset-4 hover:underline">
        Na festa! Escolher horário →
      </Link>
    );
  }
  return (
    <div className="mt-4 space-y-2">
      <button type="button" className="btn-ghost w-full py-2 text-sm" onClick={() => setState(cart.addCharacter(props).ok ? "added" : "blocked")}>
        Adicionar à festa
      </button>
      {state === "blocked" && <p className="text-xs text-red-300">Personagens entram só em pedidos de aluguel.</p>}
    </div>
  );
}
