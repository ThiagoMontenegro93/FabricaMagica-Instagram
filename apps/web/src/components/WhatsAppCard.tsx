import { FABRICA_MAGICA, whatsappLink } from "@fabrica/shared";

/** Card exibido quando o dono desligou a hospedagem de documentos (RN05). */
export function WhatsAppCard({ link, message }: { link?: string; message?: string }) {
  return (
    <div className="neon-frame bg-black/60 p-6 text-center">
      <p className="text-xs uppercase tracking-[0.3em] text-neutral-400">Verificação de documentos</p>
      <p className="mt-2 font-serif text-2xl text-white">via WhatsApp</p>
      <p className="mt-2 text-sm text-neutral-300">{message ?? "Nossa equipe vai te chamar para confirmar seus documentos."}</p>
      <a
        className="btn-gold mt-4"
        href={link ?? whatsappLink()}
        target="_blank"
        rel="noopener noreferrer"
      >
        Falar com a Fábrica Mágica
      </a>
      <p className="mt-2 text-xs text-neutral-500">wa.me/{FABRICA_MAGICA.whatsapp}</p>
    </div>
  );
}
