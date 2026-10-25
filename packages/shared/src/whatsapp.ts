import { FABRICA_MAGICA } from "./constants";

/** RF13: gera link wa.me com mensagem pronta (sem API paga). */
export function whatsappLink(message?: string, phone: string = FABRICA_MAGICA.whatsapp): string {
  const digits = phone.replace(/\D/g, "");
  const base = `https://wa.me/${digits}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

export function paymentConfirmedMessage(clientName: string, reservationCode: string, eventDate: string): string {
  return `Olá ${clientName}! 🎃 Seu pagamento da reserva ${reservationCode} para ${eventDate} foi confirmado. A Fábrica Mágica agradece!`;
}

export function returnReminderMessage(clientName: string, reservationCode: string, returnDate: string): string {
  return `Olá ${clientName}! Lembrete: a devolução da reserva ${reservationCode} é amanhã (${returnDate}). Qualquer dúvida, fale com a gente.`;
}

export function documentVerificationMessage(clientName: string): string {
  return `Olá! Sou ${clientName} e acabei de me cadastrar no site. Quero fazer a verificação de documentos para a locação.`;
}
