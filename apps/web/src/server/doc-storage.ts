import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "./env";

/**
 * Armazenamento PRIVADO dos documentos (já criptografados).
 * - local: DOCS_DIR, fora da pasta pública de mídia e sem rota que sirva os arquivos direto.
 * - s3: bucket privado S3_BUCKET (sem URL pública). Usar no Railway/Render.
 */
export interface DocStorage {
  put(key: string, body: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
}

const DOC_KEY = /^docs\/[a-z0-9]+\/[a-z0-9]+\/[a-f0-9]{32}\.bin$/;

function docsDir() {
  return path.resolve(env().DOCS_DIR ?? path.join(process.cwd(), ".private-docs"));
}

function safePath(key: string) {
  if (!DOC_KEY.test(key)) throw new Error("Chave de documento inválida");
  const root = docsDir();
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error("Chave de documento inválida");
  return full;
}

class LocalDocs implements DocStorage {
  async put(key: string, body: Uint8Array) {
    const full = safePath(key);
    await mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
    await writeFile(full, body, { flag: "wx", mode: 0o600 });
  }
  async get(key: string) {
    return readFile(safePath(key));
  }
  async delete(key: string) {
    await rm(safePath(key), { force: true });
  }
}

class S3Docs implements DocStorage {
  private client = new S3Client({
    region: process.env.S3_REGION ?? "auto",
    endpoint: process.env.S3_ENDPOINT,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "", secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "" },
  });
  constructor(private bucket: string) {}
  async put(key: string, body: Uint8Array) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: "application/octet-stream" }));
  }
  async get(key: string) {
    const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return r.Body!.transformToByteArray();
  }
  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

let instance: DocStorage | undefined;
export function docStorage(): DocStorage {
  if (instance) return instance;
  if (process.env.STORAGE_DRIVER === "s3") {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) throw new Error("STORAGE_DRIVER=s3 exige S3_BUCKET (privado) para documentos");
    instance = new S3Docs(bucket);
  } else {
    instance = new LocalDocs();
  }
  return instance;
}
