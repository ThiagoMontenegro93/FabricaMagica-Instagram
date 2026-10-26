import { clientIp, json, readJson, route } from "@/server/http";
import { requireAuth } from "@/server/auth/session";
import { isStaff } from "@/server/auth/optional";
import { currentTenant } from "@/server/tenant";
import { createTheme, listThemes } from "@/server/services/theme.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/themes?category=&q=&availableOn=2026-10-31&returnOn=2026-11-01 — catálogo público. */
export const GET = route(async (req) => {
  const tenant = await currentTenant();
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const includeHidden = sp.all === "1" && (await isStaff(req));
  delete sp.all;
  return json(await listThemes(tenant.id, sp, { includeHidden }));
});

/** POST /api/themes — o dono cadastra quantos temas quiser. */
export const POST = route(async (req) => {
  const auth = await requireAuth(req, ["SUPER_ADMIN"]);
  return json({ theme: await createTheme(auth.tid, auth.sub, await readJson(req), clientIp(req)) }, { status: 201 });
});
