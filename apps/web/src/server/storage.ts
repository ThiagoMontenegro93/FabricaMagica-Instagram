import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * Armazenamento das mídias públicas do catálogo (fotos, vídeos, GIFs).
 * - local (padrão): grava em UPLOAD_DIR e serve por /api/media/<chave>. Bom para dev e VPS com disco.
 * - s3: qualquer S3 compatível (Cloudflare R2, AWS S3). Usar no Railway/Render, onde o disco é efêmero.
 */
export interface MediaStorage {
  put(key: string, body: Uint8Array, contentType: string): Promise<string>;
}

export const KEY_REGEX = /^[A-Za-z0-9_-]+\/\d{4}\/\d{2}\/[A-Za-z0-9_-]+\.(jpg|png|webp|gif|mp4|mov|webm)$/;

export function uploadDir(): string {
  return path.resolve(process.env.UPLOAD_DIR ?? path.join(process.cwd(), ".uploads"));
}

/** Caminho no disco de uma chave, garantindo que não saia de UPLOAD_DIR. */
export function localPath(key: string): string | null {
  if (!KEY_REGEX.test(key)) return null;
  const root = uploadDir();
  const full = path.resolve(root, key);
  return full.startsWith(root + path.sep) ? full : null;
}

class LocalStorage implements MediaStorage {
  async put(key: string, body: Uint8Array) {
    const full = localPath(key);
    if (!full) throw new Error("Chave de mídia inválida");
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body, { flag: "wx" });
    return `/api/media/${key}`;
  }
}

class S3Storage implements MediaStorage {
  private client: S3Client;
  constructor(
    private bucket: string,
    private publicUrl: string,
  ) {
    this.client = new S3Client({
      region: process.env.S3_REGION ?? "auto",
      endpoint: process.env.S3_ENDPOINT,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
      },
    });
  }
  async put(key: string, body: Uint8Array, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    return `${this.publicUrl.replace(/\/$/, "")}/${key}`;
  }
}

let instance: MediaStorage | undefined;

export function storage(): MediaStorage {
  if (instance) return instance;
  if (process.env.STORAGE_DRIVER === "s3") {
    const bucket = process.env.S3_MEDIA_BUCKET;
    const publicUrl = process.env.S3_MEDIA_PUBLIC_URL;
    if (!bucket || !publicUrl) throw new Error("STORAGE_DRIVER=s3 exige S3_MEDIA_BUCKET e S3_MEDIA_PUBLIC_URL");
    instance = new S3Storage(bucket, publicUrl);
  } else {
    instance = new LocalStorage();
  }
  return instance;
}

export async function readLocal(key: string) {
  const full = localPath(key);
  if (!full) return null;
  try {
    const info = await stat(full);
    return { full, size: info.size, read: () => readFile(full) };
  } catch {
    return null;
  }
}
