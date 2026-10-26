import type { NextRequest } from "next/server";
import { getAuth } from "./session";

/** true se quem chama é da equipe (para mostrar itens ocultos no catálogo). */
export async function isStaff(req: NextRequest): Promise<boolean> {
  const auth = await getAuth(req);
  return auth?.role === "SUPER_ADMIN" || auth?.role === "ATENDENTE";
}
