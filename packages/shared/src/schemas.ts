import { z } from "zod";
import {
  DELIVERY_TYPES,
  MIN_AGE_MESSAGE,
  RESERVATION_STATUSES,
  RETENTION_OPTIONS,
  ROLES,
  THEME_CATEGORIES,
  THEME_STATUSES,
} from "./constants";
import { isValidCPF, onlyDigits } from "./cpf";
import { isAdult } from "./age";
import { ISO_DATE_REGEX, isValidIsoDate } from "./dates";

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
export const TenantSettingsSchema = z.object({
  hostSensitiveDocs: z.boolean(),
  retentionDays: z
    .number()
    .int()
    .refine((v) => (RETENTION_OPTIONS as readonly number[]).includes(v), "Retenção deve ser 30, 90 ou 365 dias"),
  requireProof: z.boolean(),
  requireSelfie: z.boolean(),
  blockWithoutDocs: z.boolean(),
  weekendMultiplier: z.number().min(1).max(3),
});
export const TenantSettingsPatchSchema = TenantSettingsSchema.partial();

// --- Catálogo (RF02, RF03) ---
export const PartyThemeSchema = z.object({
  name: z.string().trim().min(3),
  category: z.enum(THEME_CATEGORIES),
  description: z.string().trim().min(10),
  includedItems: z.array(z.string().trim().min(1)).default([]),
  sizeM2: z.number().positive().optional(),
  dailyPrice: cents,
  totalQty: z.number().int().min(0).default(1),
  weekendMultiplier: z.number().min(1).max(3).nullable().optional(),
  photos: z.array(z.string().url()).default([]),
  status: z.enum(THEME_STATUSES).default("ATIVO"),
  isBestseller: z.boolean().default(false),
  isNew: z.boolean().default(false),
});

export const LiveCharacterSchema = z.object({
  name: z.string().trim().min(3),
  description: z.string().trim().optional(),
  pricePer2h: cents,
  priceExtraHour: cents,
  photos: z.array(z.string().url()).default([]),
  active: z.boolean().default(true),
});

// --- Reserva (RF04, RF05) ---
export const ReservationRequestSchema = z
  .object({
    eventDate: isoDate,
    returnDate: isoDate,
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
