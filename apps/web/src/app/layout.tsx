import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { FABRICA_MAGICA, whatsappLink } from "@fabrica/shared";
import { Logo } from "@/components/Logo";
import "./globals.css";

export const metadata: Metadata = {
  title: "A Fábrica Mágica · Locação Premium de Festas",
  description: `${FABRICA_MAGICA.slogan} Temas de Halloween de luxo, balões e personagens vivos no Rio de Janeiro.`,
};

export const viewport: Viewport = { themeColor: "#050505" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen">
        <header className="border-b border-white/5">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
            <Link href="/" aria-label="Início">
              <Logo />
            </Link>
            <div className="flex items-center gap-4 text-sm">
              <Link href="/cadastro" className="text-neutral-300 hover:text-gold">Cadastro</Link>
              <Link href="/login" className="text-neutral-300 hover:text-gold">Entrar</Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-10">{children}</main>
        <footer className="border-t border-white/5 py-8 text-center text-xs text-neutral-500">
          <p>{FABRICA_MAGICA.address}</p>
          <p className="mt-1">
            <a className="hover:text-gold" href={whatsappLink()} target="_blank" rel="noopener noreferrer">
              WhatsApp (21) 97284-8645
            </a>{" "}
            · {FABRICA_MAGICA.instagram}
          </p>
        </footer>
      </body>
    </html>
  );
}
