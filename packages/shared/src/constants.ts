/** Dados oficiais da Fábrica Mágica (white label interno, RF15). */
export const FABRICA_MAGICA = {
  name: "A Fábrica Mágica",
  slug: "afabricamagica",
  slogan: "Alugue o Medo. Celebre o Luxo.",
  whatsapp: "5521972848645",
  instagram: "@afabricamagica",
  address: "Av. Dom Helder Câmara, 6001 - Engenho de Dentro, Rio de Janeiro - RJ",
} as const;

export const BRAND_COLORS = {
  background: "#050505",
  card: "#151515",
  input: "#1a1a1a",
  purpleNeon: "#9D00FF",
  gold: "#D4AF37",
  yellow: "#FFD700",
  pink: "#FF00A8",
  greenNeon: "#00FF88",
} as const;

export const ROLES = ["SUPER_ADMIN", "ATENDENTE", "CLIENTE", "PERSONAGEM"] as const;
export type Role = (typeof ROLES)[number];

/**
 * Categorias sugeridas. O catálogo não tem limite: o dono pode criar quantos
 * temas quiser e usar outras categorias além destas.
 */
export const THEME_CATEGORIES = [
  "Personagens e Filmes",
  "Halloween Premium",
  "Balões",
  "Setores",
  "Locação Luxo",
  "Sazonal",
] as const;
export type ThemeCategory = (typeof THEME_CATEGORIES)[number];

export const THEME_STATUSES = ["ATIVO", "MANUTENCAO", "DESCONTINUADO"] as const;
export type ThemeStatus = (typeof THEME_STATUSES)[number];

export const RESERVATION_STATUSES = [
  "PENDENTE",
  "PAGO",
  "EM_LOCACAO",
  "DEVOLVIDO",
  "ATRASADO",
  "CANCELADO",
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const DELIVERY_TYPES = ["RETIRADA", "ENTREGA"] as const;
export type DeliveryType = (typeof DELIVERY_TYPES)[number];

export const RETENTION_OPTIONS = [30, 90, 365] as const;

/** Duração base de um personagem vivo (RN03). */
export const CHARACTER_BASE_MINUTES = 120;
/** Tempo que uma reserva PENDENTE segura o estoque enquanto o cliente paga. */
export const PENDING_HOLD_MINUTES = 30;
/** Tolerância antes de marcar ATRASADO (RN08). */
export const LATE_TOLERANCE_HOURS = 24;
/** Limite de upload de documentos (RN12). */
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const ALLOWED_DOCUMENT_MIME = ["image/jpeg", "image/png", "application/pdf"] as const;

export const MIN_AGE_MESSAGE = "Cadastro permitido apenas para maiores de 18 anos";
