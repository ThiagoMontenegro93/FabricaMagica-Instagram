import { NextResponse, type NextRequest } from "next/server";
import { verifyAccessToken } from "@/server/auth/jwt";
import { ACCESS_COOKIE } from "@/server/auth/session-cookies";

/**
 * Protege as páginas do painel. As rotas /api fazem a própria checagem (requireAuth);
 * aqui é só para redirecionar quem não tem sessão de equipe.
 */
export async function middleware(req: NextRequest) {
  const token = req.cookies.get(ACCESS_COOKIE)?.value;
  const claims = token ? await verifyAccessToken(token) : null;
  const isStaff = claims?.role === "SUPER_ADMIN" || claims?.role === "ATENDENTE";
  if (!isStaff) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*"] };
