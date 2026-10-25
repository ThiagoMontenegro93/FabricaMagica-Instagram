import Link from "next/link";
import { FABRICA_MAGICA, THEME_CATEGORIES, whatsappLink } from "@fabrica/shared";
import { Logo } from "@/components/Logo";

export default function Home() {
  return (
    <div className="space-y-16">
      <section className="neon-frame flex flex-col items-center gap-6 bg-gradient-to-b from-black to-[#12001f] px-6 py-16 text-center">
        <p className="text-xs uppercase tracking-[0.4em] text-neutral-400">Atelier de Festas Sombrias</p>
        <Logo size="lg" />
        <p className="font-serif text-2xl text-gold md:text-3xl">{FABRICA_MAGICA.slogan}</p>
        <p className="max-w-xl text-neutral-300">
          Temas de Halloween de luxo, balões, sazonais e personagens vivos para a sua festa no Rio de Janeiro.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/cadastro" className="btn-gold">Criar meu cadastro</Link>
          <a href={whatsappLink("Olá! Quero saber dos temas disponíveis.")} className="btn-ghost" target="_blank" rel="noopener noreferrer">
            Falar no WhatsApp
          </a>
        </div>
      </section>

      <section>
        <h2 className="font-serif text-3xl text-white">Categorias</h2>
        <p className="mt-1 text-sm text-neutral-400">O catálogo completo com disponibilidade por data chega na próxima etapa.</p>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {THEME_CATEGORIES.map((c) => (
            <li key={c} className="card text-center font-serif text-lg text-neutral-100 transition hover:border-gold/40">
              {c}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
