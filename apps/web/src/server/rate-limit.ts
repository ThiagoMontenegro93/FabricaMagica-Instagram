import { Errors } from "./errors";

/**
 * Rate limit de janela fixa em memória. Suficiente para o MVP com uma instância.
 * Com mais de uma instância, trocar por Redis (REDIS_URL já previsto no .env).
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()) {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count++;
  if (bucket.count > limit) {
    throw Errors.tooMany(Math.ceil((bucket.resetAt - now) / 1000));
  }
}

/** Só para testes. */
export function resetRateLimits() {
  buckets.clear();
}

// Limpeza periódica para não crescer sem limite.
if (typeof setInterval !== "undefined") {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }, 60_000);
  (timer as { unref?: () => void }).unref?.();
}
