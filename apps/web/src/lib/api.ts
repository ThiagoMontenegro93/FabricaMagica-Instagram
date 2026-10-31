/** Cliente HTTP do front: renova a sessão uma vez em 401 e devolve erros legíveis. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public issues?: { path: string; message: string }[],
    public code?: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
  const res = await fetch(path, {
    ...init,
    headers: { ...(isForm ? {} : { "Content-Type": "application/json" }), ...(init.headers ?? {}) },
    credentials: "same-origin",
  });
  if (res.status === 401 && retry && !path.startsWith("/api/auth/")) {
    const r = await fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" });
    if (r.ok) return api<T>(path, init, false);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body?.error?.message ?? "Erro inesperado", body?.error?.issues, body?.error?.code);
  }
  return body as T;
}
