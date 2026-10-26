import { NextResponse, type NextRequest } from "next/server";
import { MEDIA_EXTENSION } from "@fabrica/shared";
import { readLocal } from "@/server/storage";

export const runtime = "nodejs";

const MIME_BY_EXT = Object.fromEntries(Object.entries(MEDIA_EXTENSION).map(([mime, ext]) => [ext, mime]));

/**
 * GET /api/media/<chave> — serve as mídias do armazenamento local.
 * Suporta Range (necessário para o vídeo tocar no Safari/iPhone).
 */
export async function GET(req: NextRequest, { params }: { params: { key: string[] } }) {
  const key = params.key.join("/");
  const file = await readLocal(key);
  if (!file) return new NextResponse("Não encontrado", { status: 404 });

  const ext = key.split(".").pop() ?? "";
  const headers: Record<string, string> = {
    "Content-Type": MIME_BY_EXT[ext] ?? "application/octet-stream",
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'",
    "Accept-Ranges": "bytes",
  };
  const data = await file.read();

  const range = req.headers.get("range");
  const m = range?.match(/^bytes=(\d*)-(\d*)$/);
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : file.size - Number(m[2]);
    let end = m[1] && m[2] ? Number(m[2]) : file.size - 1;
    start = Math.max(0, start);
    end = Math.min(end, file.size - 1);
    if (start > end) {
      return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${file.size}` } });
    }
    return new NextResponse(data.subarray(start, end + 1), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${file.size}`, "Content-Length": String(end - start + 1) },
    });
  }
  return new NextResponse(data, { status: 200, headers: { ...headers, "Content-Length": String(file.size) } });
}
