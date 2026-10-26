import { MEDIA_LIMITS, type MediaKind } from "@fabrica/shared";
import { json, route } from "@/server/http";
import { requireAuth } from "@/server/auth/session";
import { rateLimit } from "@/server/rate-limit";
import { AppError, Errors } from "@/server/errors";
import { uploadMedia } from "@/server/services/media.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = new Set<MediaKind>(["image", "gif", "video"]);

/** POST /api/uploads/media (multipart: file, kind?) — fotos, vídeo curto e GIF dos temas. */
export const POST = route(async (req) => {
  const auth = await requireAuth(req, ["SUPER_ADMIN"]);
  rateLimit(`upload:${auth.sub}`, 120, 60 * 60_000);

  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MEDIA_LIMITS.video + 1024 * 1024) throw new AppError(413, "TOO_LARGE", "Arquivo grande demais");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw Errors.badRequest("Envie o arquivo como multipart/form-data no campo 'file'");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw Errors.badRequest("Campo 'file' ausente");
  const kind = form.get("kind");
  const expected = typeof kind === "string" && KINDS.has(kind as MediaKind) ? (kind as MediaKind) : undefined;

  return json(await uploadMedia(auth.tid, auth.sub, file, expected), { status: 201 });
});
