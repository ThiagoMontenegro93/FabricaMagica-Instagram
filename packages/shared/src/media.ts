/** Tipos de mídia aceitos no catálogo e limites de tamanho. */
export type MediaKind = "image" | "gif" | "video";

export const MEDIA_LIMITS: Record<MediaKind, number> = {
  image: 8 * 1024 * 1024,
  gif: 10 * 1024 * 1024,
  video: 40 * 1024 * 1024,
};

/** Duração máxima do vídeo curto (conferida no navegador antes do envio). */
export const MAX_VIDEO_SECONDS = 30;
export const MAX_THEME_PHOTOS = 20;

export const MEDIA_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

const ascii = (b: Uint8Array, start: number, len: number) => String.fromCharCode(...b.slice(start, start + len));

/**
 * Descobre o tipo REAL do arquivo pelos primeiros bytes ("magic numbers"),
 * sem confiar na extensão nem no Content-Type enviado pelo navegador.
 */
export function sniffMedia(bytes: Uint8Array): { mime: string; kind: MediaKind } | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: "image/jpeg", kind: "image" };
  if (ascii(bytes, 0, 8) === "\x89PNG\r\n\x1a\n") return { mime: "image/png", kind: "image" };
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return { mime: "image/webp", kind: "image" };
  if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") return { mime: "image/gif", kind: "gif" };
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return { mime: "video/webm", kind: "video" };
  if (ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 4);
    if (brand === "qt  ") return { mime: "video/quicktime", kind: "video" };
    if (/^(isom|iso[2-9]|mp41|mp42|avc1|M4V |MSNV|dash)$/.test(brand)) return { mime: "video/mp4", kind: "video" };
  }
  return null;
}

/** URL de mídia aceita nos temas: https externo ou arquivo enviado (/api/media/...). */
export function isMediaUrl(value: string): boolean {
  if (/^\/api\/media\/[A-Za-z0-9/_.-]+$/.test(value) && !value.includes("..")) return true;
  return /^https:\/\/[a-z0-9.-]+(:\d+)?(\/[^\s<>"']*)?$/i.test(value);
}
