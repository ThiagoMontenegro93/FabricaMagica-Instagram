/** Erro de domínio com status HTTP e código estável para o front. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const Errors = {
  unauthorized: (msg = "Faça login para continuar") => new AppError(401, "UNAUTHORIZED", msg),
  forbidden: (msg = "Você não tem permissão para esta ação") => new AppError(403, "FORBIDDEN", msg),
  notFound: (msg = "Não encontrado") => new AppError(404, "NOT_FOUND", msg),
  conflict: (msg: string) => new AppError(409, "CONFLICT", msg),
  tooMany: (retryAfterSec: number) =>
    new AppError(429, "RATE_LIMITED", "Muitas tentativas. Tente novamente em instantes.", { retryAfterSec }),
  badRequest: (msg: string, details?: unknown) => new AppError(400, "BAD_REQUEST", msg, details),
};
