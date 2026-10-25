import { json, route } from "@/server/http";
import { currentTenant } from "@/server/tenant";
import { getPublicSettings } from "@/server/services/settings.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/tenant/public-settings — o cadastro decide entre upload e WhatsApp. */
export const GET = route(async () => {
  const tenant = await currentTenant();
  return json(await getPublicSettings(tenant.id));
});
