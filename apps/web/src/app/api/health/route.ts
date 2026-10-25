import { prisma } from "@fabrica/db";
import { json } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Healthcheck para Railway/Render: confirma que o banco responde. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return json({ status: "ok" });
  } catch {
    return json({ status: "degraded" }, { status: 503 });
  }
}
