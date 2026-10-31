import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatório"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET precisa de ao menos 32 caracteres"),
  TENANT_SLUG: z.string().default("afabricamagica"),
  /** Origem pública do site, usada na checagem anti-CSRF. Ex.: https://afabricamagica.com.br */
  APP_ORIGIN: z.string().url().optional(),
  /** Chave AES-256 (32 bytes em base64) dos documentos sensíveis. Sem ela, o upload fica desligado. */
  DOCS_ENCRYPTION_KEY: z.string().optional(),
  /** Pasta privada dos documentos no modo local (fora da pasta pública de mídia). */
  DOCS_DIR: z.string().optional(),
  /** Segredo das rotinas agendadas (/api/cron/*). */
  CRON_SECRET: z.string().min(16).optional(),
  /** Mercado Pago (produção ou credenciais de teste). Sem token, o pagamento é combinado pelo WhatsApp. */
  MERCADOPAGO_ACCESS_TOKEN: z.string().optional(),
  /** Chave secreta do webhook (Suas integrações > Webhooks). Obrigatória em produção. */
  MERCADOPAGO_WEBHOOK_SECRET: z.string().optional(),
  /** "1" liga o simulador de pagamento fora de produção (demonstração e testes). */
  PAYMENTS_SIMULATOR: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

/** Lê e valida as variáveis de ambiente na primeira chamada (não quebra o build). */
export function env(): Env {
  if (!cached) {
    const parsed = EnvSchema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Variáveis de ambiente inválidas: ${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** Só para testes. */
export function resetEnvCache() {
  cached = undefined;
}
