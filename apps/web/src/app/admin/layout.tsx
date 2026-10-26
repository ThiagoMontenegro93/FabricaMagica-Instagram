import Link from "next/link";

const LINKS = [
  { href: "/admin/temas", label: "Temas" },
  { href: "/admin/personagens", label: "Personagens" },
  { href: "/admin/configuracoes", label: "Configurações" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-8">
      <nav className="flex flex-wrap gap-2 border-b border-white/5 pb-4" aria-label="Painel">
        <span className="mr-2 font-serif text-lg text-gold">Painel</span>
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="rounded-full border border-white/10 px-4 py-1 text-sm text-neutral-300 hover:border-gold hover:text-gold">
            {l.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
