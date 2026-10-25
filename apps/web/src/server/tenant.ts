import { prisma } from "@fabrica/db";
import { env } from "./env";
import { Errors } from "./errors";

/** Single-tenant hoje: resolve o tenant pelo slug configurado (franquia no futuro: por domínio). */
export async function currentTenant() {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: env().TENANT_SLUG },
    include: { settings: true },
  });
  if (!tenant || !tenant.settings) throw Errors.notFound("Tenant não configurado. Rode pnpm db:seed.");
  return tenant as typeof tenant & { settings: NonNullable<typeof tenant.settings> };
}
