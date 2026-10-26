import { clientIp, json, readJson, route } from "@/server/http";
import { requireAuth } from "@/server/auth/session";
import { isStaff } from "@/server/auth/optional";
import { currentTenant } from "@/server/tenant";
import { createCharacter, listCharacters } from "@/server/services/character.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/characters — personagens vivos ativos (equipe vê inativos com ?all=1). */
export const GET = route(async (req) => {
  const tenant = await currentTenant();
  const includeInactive = req.nextUrl.searchParams.get("all") === "1" && (await isStaff(req));
  return json({ items: await listCharacters(tenant.id, { includeInactive }) });
});

export const POST = route(async (req) => {
  const auth = await requireAuth(req, ["SUPER_ADMIN"]);
  return json({ character: await createCharacter(auth.tid, auth.sub, await readJson(req), clientIp(req)) }, { status: 201 });
});
