import { clientIp, json, readJson, route } from "@/server/http";
import { STAFF_ROLES, requireAuth } from "@/server/auth/session";
import { rateLimit } from "@/server/rate-limit";
import { createClient, listClients } from "@/server/services/client.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/clients — cadastro de locação 18+ (cliente logado ou equipe). */
export const POST = route(async (req) => {
  const auth = await requireAuth(req, ["CLIENTE", ...STAFF_ROLES]);
  rateLimit(`clients:create:${auth.sub}`, 10, 60 * 60_000);
  const result = await createClient(auth.tid, { id: auth.sub, role: auth.role }, await readJson(req), clientIp(req));
  return json(result, { status: 201 });
});

/** GET /api/clients?q=&cursor=&take= — lista para a equipe, com CPF mascarado para atendente. */
export const GET = route(async (req) => {
  const auth = await requireAuth(req, STAFF_ROLES);
  const sp = req.nextUrl.searchParams;
  const take = sp.get("take") ? Number(sp.get("take")) : undefined;
  return json(
    await listClients(
      auth.tid,
      { id: auth.sub, role: auth.role },
      { q: sp.get("q") ?? undefined, cursor: sp.get("cursor") ?? undefined, take: Number.isFinite(take) ? take : undefined },
      clientIp(req),
    ),
  );
});
