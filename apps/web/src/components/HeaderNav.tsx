"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cartCount, useCart } from "@/lib/cart";

type Me = { role: string; email: string } | null;

/** Menu do topo: muda conforme quem está logado e mostra o carrinho com contador. */
export function HeaderNav() {
  const [me, setMe] = useState<Me | undefined>(undefined);
  const count = cartCount(useCart());
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then(async (r) => {
        if (r.ok) return setMe((await r.json()).user);
        // Access token vencido: tenta renovar uma vez em silêncio.
        const refreshed = await fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" });
        if (!refreshed.ok) return setMe(null);
        const again = await fetch("/api/auth/me", { credentials: "same-origin" });
        setMe(again.ok ? (await again.json()).user : null);
      })
      .catch(() => setMe(null));
  }, [pathname]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    setMe(null);
    router.push("/");
    router.refresh();
  }

  const staff = me?.role === "SUPER_ADMIN" || me?.role === "ATENDENTE";
  const link = "rounded-full px-3 py-1.5 text-neutral-300 transition-colors hover:text-gold";

  return (
    <div className="flex items-center gap-1 text-sm sm:gap-2">
      <Link href="/#temas" className={`${link} hidden sm:inline-flex`}>Temas</Link>
      {staff && <Link href="/admin" className={link}>Painel</Link>}
      {me && !staff && <Link href="/reservas" className={link}>Minhas reservas</Link>}
      {me === null && <Link href="/login" className={link}>Entrar</Link>}
      {me && (
        <button type="button" onClick={logout} className={link}>
          Sair
        </button>
      )}
      <Link
        href="/carrinho"
        aria-label={`Carrinho, ${count} ${count === 1 ? "item" : "itens"}`}
        className="press relative ml-1 inline-flex h-10 items-center gap-2 rounded-full border border-gold/40 px-4 text-gold transition-colors hover:border-gold hover:bg-gold/10"
      >
        <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="10" cy="20" r="1.3" />
          <circle cx="17" cy="20" r="1.3" />
        </svg>
        <span className="hidden sm:inline">Carrinho</span>
        {count > 0 && (
          <span className="pop-in grid h-5 min-w-5 place-items-center rounded-full bg-neon-pink px-1 text-xs font-bold text-black">{count}</span>
        )}
      </Link>
    </div>
  );
}
