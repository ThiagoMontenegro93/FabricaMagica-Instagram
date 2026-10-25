import { json, route } from "@/server/http";
import { requireAuth } from "@/server/auth/session";
import { me } from "@/server/services/auth.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const auth = await requireAuth(req);
  return json({ user: await me(auth.sub) });
});
