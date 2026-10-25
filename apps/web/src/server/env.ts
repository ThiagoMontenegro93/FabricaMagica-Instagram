import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatório"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET precisa de ao menos 32 caracteres"),
  TENANT_SLUG: z.string().default("afabricamagica"),
  /** Origem pública do site, usada na checagem anti-CSRF. Ex.: https://afabricamagica.com.br */
  APP_ORIGIN: z.string().url().optional(),
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
