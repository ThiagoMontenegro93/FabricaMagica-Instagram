import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Errors } from "./errors";
import { env } from "./env";

/** Chave AES-256 dos documentos. Sem chave válida o upload fica desligado (nunca grava em claro). */
function key(): Buffer {
  const raw = env().DOCS_ENCRYPTION_KEY;
  const buf = raw ? Buffer.from(raw, "base64") : Buffer.alloc(0);
  if (buf.length !== 32) {
    throw new Error("DOCS_ENCRYPTION_KEY ausente ou inválida");
  }
  return buf;
}

export function docsEncryptionReady(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

export function sha256(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** RN06: AES-256-GCM com IV aleatório por arquivo; a tag GCM detecta qualquer alteração. */
export function encrypt(plain: Uint8Array) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return { body, iv: iv.toString("base64"), authTag: cipher.getAuthTag().toString("base64") };
}

export function decrypt(body: Uint8Array, iv: string, authTag: string): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(authTag, "base64"));
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

/**
 * Link temporário de documento: HMAC(id + validade) com chave derivada do JWT_SECRET.
 * Mesmo com o link, a rota exige sessão da equipe.
 */
function linkKey() {
  return createHash("sha256").update(`docs-link:${env().JWT_SECRET}`).digest();
}

export function signDocLink(id: string, expiresAt: Date): string {
  const exp = Math.floor(expiresAt.getTime() / 1000);
  const sig = createHmac("sha256", linkKey()).update(`${id}.${exp}`).digest("base64url");
  return `${exp}.${sig}`;
}

export function verifyDocLink(id: string, token: string | null, now = new Date()) {
  const [expRaw, sig] = (token ?? "").split(".");
  const exp = Number(expRaw);
  if (!sig || !Number.isInteger(exp) || exp * 1000 < now.getTime()) throw Errors.forbidden("Link expirado. Gere outro no painel.");
  const expected = createHmac("sha256", linkKey()).update(`${id}.${exp}`).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw Errors.forbidden("Link inválido");
}
