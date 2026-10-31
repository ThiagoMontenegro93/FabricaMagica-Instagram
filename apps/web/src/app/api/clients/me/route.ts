import { json, route } from "@/server/http";
import { requireAuth } from "@/server/auth/session";
import { getMyClient } from "@/server/services/client.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/clients/me — cadastro de locação do cliente logado (null se ainda não fez). */
export const GET = route(async (req) => {
  const auth = await requireAuth(req);
  return json({ client: await getMyClient(auth.tid, auth.sub) });
});
