import { z } from "zod";
import {
  DEAL_TYPES,
  DELIVERY_TYPES,
  OFFER_MODES,
  MIN_AGE_MESSAGE,
  RESERVATION_STATUSES,
  RETENTION_OPTIONS,
  ROLES,
  THEME_STATUSES,
} from "./constants";
import { isValidCPF, onlyDigits } from "./cpf";
import { isAdult } from "./age";
import { ISO_DATE_REGEX, isValidIsoDate } from "./dates";
import { MAX_THEME_PHOTOS, isMediaUrl } from "./media";

const cents = z.number().int().nonnegative();
const isoDate = z
  .string()
  .regex(ISO_DATE_REGEX, "Use o formato AAAA-MM-DD")
  .refine(isValidIsoDate, "Data inválida");
const phoneBR = z
  .string()
  .transform(onlyDigits)
  .refine((v) => v.length >= 10 && v.length <= 13, "Telefone inválido");

export const AddressSchema = z.object({
  cep: z.string().transform(onlyDigits).refine((v) => v.length === 8, "CEP deve ter 8 dígitos"),
  rua: z.string().trim().min(2),
  numero: z.string().trim().min(1),
  complemento: z.string().trim().optional(),
  bairro: z.string().trim().min(2),
  cidade: z.string().trim().min(2),
  estado: z.string().trim().length(2, "Use a sigla do estado (ex.: RJ)").toUpperCase(),
});
export type Address = z.infer<typeof AddressSchema>;

// --- Auth (RF01) ---
export const PasswordSchema = z
  .string()
  .min(8, "Mínimo de 8 caracteres")
  .max(128)
  .regex(/[A-Za-z]/, "Inclua ao menos uma letra")
  .regex(/\d/, "Inclua ao menos um número");

export const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export const RegisterSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: PasswordSchema,
  role: z.enum(ROLES).default("CLIENTE"),
});

// --- Cliente (RF06, RN01, RN04, RN11) ---
export const ClientSchema = z
  .object({
    name: z.string().trim().min(3, "Informe o nome completo"),
    cpf: z
      .string()
      .refine(isValidCPF, "CPF inválido")
      .transform(onlyDigits),
    rg: z.string().trim().min(4, "RG inválido"),
    birthDate: z.coerce.date().refine((d) => isAdult(d), MIN_AGE_MESSAGE),
    email: z.string().trim().toLowerCase().email(),
    whatsapp: phoneBR,
    phone2: phoneBR.optional(),
    address: AddressSchema,
    partyAddressDifferent: z.boolean().default(false),
    partyAddress: AddressSchema.optional(),
    lgpdConsent: z.literal(true, { errorMap: () => ({ message: "Aceite a política de privacidade (LGPD)" }) }),
    contractAccepted: z.literal(true, { errorMap: () => ({ message: "Aceite o contrato de locação" }) }),
  })
  .superRefine((c, ctx) => {
    if (c.partyAddressDifferent && !c.partyAddress) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["partyAddress"], message: "Informe o endereço da festa" });
    }
  });
export type ClientInput = z.input<typeof ClientSchema>;
export type Client = z.output<typeof ClientSchema>;

// --- Configurações de privacidade (RF12) ---
const TenantSettingsBase = z.object({
  hostSensitiveDocs: z.boolean(),
  retentionDays: z
    .number()
    .int()
    .refine((v) => (RETENTION_OPTIONS as readonly number[]).includes(v), "Retenção deve ser 30, 90 ou 365 dias"),
  requireProof: z.boolean(),
  requireSelfie: z.boolean(),
  blockWithoutDocs: z.boolean(),
  weekendMultiplier: z.number().min(1).max(3),
  /** Frete cobrado do contratante quando a equipe entrega e busca o tema (centavos). */
  deliveryFeeBase: cents.max(1_000_000),
  /** Como os temas sem configuração própria aparecem no site. */
  defaultOfferMode: z.enum(OFFER_MODES),
  /** Cliente pode retirar na loja e cuidar do transporte (sem frete). */
  allowPickup: z.boolean(),
  /** Loja entrega e busca, cobrando frete. */
  allowDelivery: z.boolean(),
});
const atLeastOneDelivery = (s: { allowPickup?: boolean; allowDelivery?: boolean }) =>
  s.allowPickup !== false || s.allowDelivery !== false;
const deliveryMessage = { path: ["allowDelivery"], message: "Deixe ao menos uma forma de entrega: retirada ou entrega" };
export const TenantSettingsSchema = TenantSettingsBase.refine(atLeastOneDelivery, deliveryMessage);
export const TenantSettingsPatchSchema = TenantSettingsBase.partial().refine(atLeastOneDelivery, deliveryMessage);

// --- Catálogo (RF02, RF03) ---
const photoUrl = z.string().trim().max(500).refine(isMediaUrl, "Use um link https ou um arquivo enviado");

const PartyThemeBase = z.object({
  name: z.string().trim().min(3, "Nome com ao menos 3 letras").max(80),
  /** Categoria livre: as sugestões ficam em THEME_CATEGORIES. */
  category: z.string().trim().min(2, "Informe a categoria").max(40),
  description: z.string().trim().min(10, "Descrição com ao menos 10 caracteres").max(2000),
  includedItems: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  sizeM2: z.number().positive().max(10_000).nullable().optional(),
  dailyPrice: cents,
  /** Quantos kits iguais existem: cada um atende uma festa por período. */
  totalQty: z.number().int().min(0).max(1000).default(1),
  weekendMultiplier: z.number().min(1).max(3).nullable().optional(),
  photos: z.array(photoUrl).max(MAX_THEME_PHOTOS, `No máximo ${MAX_THEME_PHOTOS} fotos`).default([]),
  videoUrl: photoUrl.nullable().optional(),
  gifUrl: photoUrl.nullable().optional(),
  /** Frete próprio do tema (centavos); null usa o frete padrão da loja. */
  deliveryFee: cents.max(1_000_000).nullable().optional(),
  /** null = segue o padrão da loja. */
  offerMode: z.enum(OFFER_MODES).nullable().optional(),
  /** Preço de venda em centavos; obrigatório quando o tema é vendido. */
  salePrice: cents.max(100_000_000).nullable().optional(),
  /** Unidades à venda (a venda baixa daqui, não dos kits de aluguel). */
  saleQty: z.number().int().min(0).max(1000).default(0),
  /** null = segue o padrão da loja. */
  allowPickup: z.boolean().nullable().optional(),
  allowDelivery: z.boolean().nullable().optional(),
  status: z.enum(THEME_STATUSES).default("ATIVO"),
  isBestseller: z.boolean().default(false),
  isNew: z.boolean().default(false),
});

type ThemeOfferCheck = { offerMode?: string | null; salePrice?: number | null; allowPickup?: boolean | null; allowDelivery?: boolean | null };
/** Regras de oferta checadas também no serviço, após juntar com o tema salvo. */
export function themeOfferIssues(t: ThemeOfferCheck): { path: string; message: string }[] {
  const issues: { path: string; message: string }[] = [];
  if ((t.offerMode === "VENDA" || t.offerMode === "AMBOS") && t.salePrice == null) {
    issues.push({ path: "salePrice", message: "Informe o preço de venda para vender este tema" });
  }
  if (t.allowPickup === false && t.allowDelivery === false) {
    issues.push({ path: "allowDelivery", message: "Deixe ao menos uma forma de entrega: retirada ou entrega" });
  }
  return issues;
}
const offerRefine = (t: ThemeOfferCheck, ctx: z.RefinementCtx) => {
  for (const i of themeOfferIssues(t)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i.path], message: i.message });
};
export const PartyThemeSchema = PartyThemeBase.superRefine(offerRefine);
export const PartyThemePatchSchema = PartyThemeBase.partial().superRefine(offerRefine);

export const LiveCharacterSchema = z.object({
  name: z.string().trim().min(3).max(80),
  description: z.string().trim().max(2000).nullable().optional(),
  pricePer2h: cents,
  priceExtraHour: cents,
  photos: z.array(photoUrl).max(12).default([]),
  active: z.boolean().default(true),
});
export const LiveCharacterPatchSchema = LiveCharacterSchema.partial();

/** Bloqueio manual da agenda de um personagem (folga, outro evento). */
export const CharacterBlockSchema = z
  .object({
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    note: z.string().trim().max(500).optional(),
  })
  .refine((b) => b.endsAt > b.startsAt, { path: ["endsAt"], message: "Fim deve ser depois do início" })
  .refine((b) => b.endsAt.getTime() - b.startsAt.getTime() <= 7 * 86_400_000, {
    path: ["endsAt"],
    message: "Bloqueio de no máximo 7 dias por vez",
  });

export const CatalogQuerySchema = z.object({
  category: z.string().trim().max(40).optional(),
  q: z.string().trim().max(80).optional(),
  availableOn: isoDate.optional(),
  returnOn: isoDate.optional(),
  /** aluguel = temas que podem ser alugados; venda = temas à venda. */
  tipo: z.enum(["aluguel", "venda"]).optional(),
});

// --- Reserva (RF04, RF05) ---
export const ReservationRequestSchema = z
  .object({
    eventDate: isoDate,
    returnDate: isoDate,
    dealType: z.enum(DEAL_TYPES).default("ALUGUEL"),
    deliveryType: z.enum(DELIVERY_TYPES),
    deliveryAddress: AddressSchema.optional(),
    themes: z.array(z.object({ themeId: z.string().min(1), quantity: z.number().int().min(1).default(1) })).default([]),
    characters: z
      .array(
        z.object({
          characterId: z.string().min(1),
          startsAt: z.coerce.date(),
          extraHours: z.number().int().min(0).max(6).default(0),
        }),
      )
      .default([]),
  })
  .superRefine((r, ctx) => {
    if (r.returnDate < r.eventDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["returnDate"], message: "Devolução antes do evento" });
    }
    if (r.themes.length === 0 && r.characters.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["themes"], message: "Adicione ao menos um tema ou personagem" });
    }
    if (r.deliveryType === "ENTREGA" && !r.deliveryAddress) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["deliveryAddress"], message: "Informe o endereço de entrega" });
    }
  });

export const ReservationStatusPatchSchema = z.object({
  status: z.enum(RESERVATION_STATUSES),
  note: z.string().trim().max(1000).optional(),
});
