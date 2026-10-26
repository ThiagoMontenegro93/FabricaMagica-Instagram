import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@fabrica/db";
import { MEDIA_EXTENSION, MEDIA_LIMITS, sniffMedia, type MediaKind } from "@fabrica/shared";
import { AppError, Errors } from "../errors";
import { storage } from "../storage";
import { log } from "../logger";

const LABEL: Record<MediaKind, string> = { image: "Foto", gif: "GIF", video: "Vídeo" };
const MB = (n: number) => `${Math.round(n / 1024 / 1024)} MB`;

/**
 * Recebe um arquivo do painel: confere o tipo real pelos bytes, o tamanho por tipo,
 * evita duplicado (mesmo SHA-256) e grava no armazenamento configurado.
 */
export async function uploadMedia(tenantId: string, userId: string, file: File, expected?: MediaKind) {
  if (file.size === 0) throw Errors.badRequest("Arquivo vazio");
  if (file.size > MEDIA_LIMITS.video) throw new AppError(413, "TOO_LARGE", `Arquivo maior que ${MB(MEDIA_LIMITS.video)}`);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = sniffMedia(bytes);
  if (!detected) throw Errors.badRequest("Formato não aceito. Use JPG, PNG, WEBP, GIF, MP4, MOV ou WEBM.");
  if (expected && detected.kind !== expected) {
    throw Errors.badRequest(`Esperava ${LABEL[expected].toLowerCase()}, mas o arquivo é ${LABEL[detected.kind].toLowerCase()}.`);
  }
  if (bytes.length > MEDIA_LIMITS[detected.kind]) {
    throw new AppError(413, "TOO_LARGE", `${LABEL[detected.kind]} pode ter até ${MB(MEDIA_LIMITS[detected.kind])}`);
  }

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const existing = await prisma.mediaAsset.findFirst({ where: { tenantId, sha256 }, select: { url: true, mimeType: true } });
  if (existing) return { url: existing.url, kind: detected.kind, mimeType: existing.mimeType, duplicate: true };

  const now = new Date();
  const key = `${tenantId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomBytes(12).toString("base64url")}.${MEDIA_EXTENSION[detected.mime]}`;
  const url = await storage().put(key, bytes, detected.mime);
  await prisma.mediaAsset.create({
    data: { tenantId, key, url, mimeType: detected.mime, sizeBytes: bytes.length, sha256, uploadedBy: userId },
  });
  log("info", { action: "MEDIA_UPLOAD", tenantId, userId, target: key, kind: detected.kind, sizeBytes: bytes.length });
  return { url, kind: detected.kind, mimeType: detected.mime, duplicate: false };
}
