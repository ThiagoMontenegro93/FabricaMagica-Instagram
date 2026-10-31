import type { Address, DealType, DeliveryType, ReservationStatus } from "@fabrica/shared";

/** Reserva como a API devolve (datas do evento em "YYYY-MM-DD"). */
export interface ReservationDTO {
  id: string;
  code: string;
  status: ReservationStatus;
  dealType: DealType;
  deliveryType: DeliveryType;
  deliveryAddress: Address | null;
  eventDate: string;
  returnDate: string;
  subtotal: number;
  weekendFee: number;
  deliveryFee: number;
  lateFee: number;
  damageFee: number;
  totalPrice: number;
  holdExpiresAt: string | null;
  paidAt: string | null;
  deliveredAt: string | null;
  returnedAt: string | null;
  cancelledAt: string | null;
  pixQrCode: string | null;
  createdAt: string;
  client: { id: string; name: string; whatsapp: string; email: string };
  themes: { id: string; quantity: number; unitPrice: number; weekendFee: number; theme: { id: string; name: string; slug: string; photos: string[] } }[];
  characters: { id: string; startsAt: string; extraHours: number; price: number; character: { id: string; name: string } }[];
}
