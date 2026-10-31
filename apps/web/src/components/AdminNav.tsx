"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Visão geral", exact: true },
  { href: "/admin/reservas", label: "Reservas" },
  { href: "/admin/clientes", label: "Clientes" },
  { href: "/admin/temas", label: "Temas" },
  { href: "/admin/personagens", label: "Personagens" },
  { href: "/admin/configuracoes", label: "Configurações" },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="-mx-4 flex gap-2 overflow-x-auto border-b border-white/5 px-4 pb-4" aria-label="Painel">
      <span className="mr-2 hidden shrink-0 self-center font-serif text-lg text-gold sm:inline">Painel</span>
      {LINKS.map((l) => {
        const active = l.exact ? path === l.href : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`press shrink-0 rounded-full border px-4 py-1.5 text-sm transition-colors ${
              active ? "border-gold bg-gold/10 text-gold" : "border-white/10 text-neutral-300 hover:border-gold/50 hover:text-gold"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
