import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { AppError, Errors } from "./errors";
import { env } from "./env";
import { log } from "./logger";

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

/** IP do cliente atrás do proxy do Railway/Render. */
export function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.ip || "unknown";
}

/**
 * Proteção CSRF para rotas que mudam estado e usam cookie:
 * a origem da requisição precisa ser o próprio site.
 */
export function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return; // chamadas server-to-server/curl não mandam Origin; cookies SameSite=Lax cobrem o navegador
  const allowed = env().APP_ORIGIN ?? req.nextUrl.origin;
  if (origin !== allowed) throw Errors.forbidden("Origem não permitida");
}

export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw Errors.badRequest("Corpo da requisição deve ser JSON válido");
  }
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

/** Envolve um Route Handler: converte erros em respostas JSON padronizadas e loga falhas. */
export function route<C = unknown>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof ZodError) {
        return json(
          {
            error: {
              code: "VALIDATION",
              message: err.issues[0]?.message ?? "Dados inválidos",
              issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
            },
          },
          { status: 400 },
        );
      }
      if (err instanceof AppError) {
        const headers: Record<string, string> = {};
        const retry = (err.details as { retryAfterSec?: number } | undefined)?.retryAfterSec;
        if (err.status === 429 && retry) headers["Retry-After"] = String(retry);
        return json({ error: { code: err.code, message: err.message } }, { status: err.status, headers });
      }
      log("error", { action: "UNHANDLED_ERROR", path: req.nextUrl.pathname, message: String(err) });
      return json({ error: { code: "INTERNAL", message: "Erro interno. Tente novamente." } }, { status: 500 });
    }
  };
}
