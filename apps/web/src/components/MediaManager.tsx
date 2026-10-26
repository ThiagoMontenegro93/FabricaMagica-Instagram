"use client";

import { useRef, useState } from "react";
import { MAX_THEME_PHOTOS, MAX_VIDEO_SECONDS, MEDIA_LIMITS, type MediaKind } from "@fabrica/shared";
import { ApiError } from "@/lib/api";

async function upload(file: File, kind: MediaKind): Promise<string> {
  const body = new FormData();
  body.append("file", file);
  body.append("kind", kind);
  const send = () => fetch("/api/uploads/media", { method: "POST", body, credentials: "same-origin" });
  let res = await send();
  if (res.status === 401 && (await fetch("/api/auth/refresh", { method: "POST" })).ok) res = await send();
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data?.error?.message ?? "Falha no envio");
  return data.url as string;
}

/** Lê a duração do vídeo no navegador antes de enviar. */
function videoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(v.duration);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível ler o vídeo"));
    };
    v.src = url;
  });
}

const MB = (n: number) => Math.round(n / 1024 / 1024);

export interface MediaValue {
  photos: string[];
  videoUrl: string | null;
  gifUrl: string | null;
}

/** Fotos (várias, a primeira é a capa), um vídeo curto e um GIF por tema. */
export function MediaManager({ value, onChange }: { value: MediaValue; onChange: (v: MediaValue) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const gifInput = useRef<HTMLInputElement>(null);

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const room = MAX_THEME_PHOTOS - value.photos.length;
    const list = Array.from(files).slice(0, room);
    if (files.length > room) setError(`Limite de ${MAX_THEME_PHOTOS} fotos: ${files.length - room} ficaram de fora.`);
    const urls: string[] = [];
    for (const [i, f] of list.entries()) {
      setBusy(`Enviando foto ${i + 1} de ${list.length}...`);
      try {
        if (f.size > MEDIA_LIMITS.image) throw new Error(`${f.name}: foto acima de ${MB(MEDIA_LIMITS.image)} MB`);
        urls.push(await upload(f, "image"));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha no envio");
      }
    }
    onChange({ ...value, photos: [...value.photos, ...urls.filter((u) => !value.photos.includes(u))] });
    setBusy(null);
  }

  async function setVideo(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      if (file.size > MEDIA_LIMITS.video) throw new Error(`Vídeo acima de ${MB(MEDIA_LIMITS.video)} MB`);
      const seconds = await videoDuration(file).catch(() => 0);
      if (seconds > MAX_VIDEO_SECONDS + 0.5) throw new Error(`O vídeo tem ${Math.round(seconds)}s. O limite é ${MAX_VIDEO_SECONDS}s.`);
      setBusy("Enviando vídeo...");
      onChange({ ...value, videoUrl: await upload(file, "video") });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha no envio");
    } finally {
      setBusy(null);
    }
  }

  async function setGif(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      if (file.size > MEDIA_LIMITS.gif) throw new Error(`GIF acima de ${MB(MEDIA_LIMITS.gif)} MB`);
      setBusy("Enviando GIF...");
      onChange({ ...value, gifUrl: await upload(file, "gif") });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha no envio");
    } finally {
      setBusy(null);
    }
  }

  const move = (i: number) => {
    const photos = [...value.photos];
    const [p] = photos.splice(i, 1);
    onChange({ ...value, photos: [p!, ...photos] });
  };

  return (
    <div className="space-y-5">
      {error && <p className="alert-error" role="alert">{error}</p>}
      {busy && <p className="text-sm text-neon-yellow" role="status">{busy}</p>}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="label mb-0">Fotos ({value.photos.length}/{MAX_THEME_PHOTOS})</span>
          <button type="button" className="btn-ghost px-4 py-1.5 text-sm" disabled={!!busy || value.photos.length >= MAX_THEME_PHOTOS} onClick={() => photoInput.current?.click()}>
            + Enviar fotos
          </button>
          <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
        </div>
        {value.photos.length === 0 ? (
          <button
            type="button"
            onClick={() => photoInput.current?.click()}
            className="flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-gold/50 py-10 text-sm text-neutral-400 hover:border-gold hover:text-gold"
          >
            Clique para escolher várias fotos de uma vez (JPG, PNG ou WEBP, até {MB(MEDIA_LIMITS.image)} MB cada)
          </button>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {value.photos.map((url, i) => (
              <li key={url} className="group relative aspect-square overflow-hidden rounded-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
                {i === 0 && <span className="absolute left-1 top-1 rounded bg-gold px-1.5 text-[10px] font-semibold text-black">CAPA</span>}
                <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/70 p-1 text-[11px] opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                  {i > 0 ? <button type="button" className="text-gold" onClick={() => move(i)}>Virar capa</button> : <span />}
                  <button type="button" className="text-red-300" onClick={() => onChange({ ...value, photos: value.photos.filter((p) => p !== url) })}>Remover</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex gap-2">
          <input className="field text-sm" placeholder="Ou cole um link https de foto" value={link} onChange={(e) => setLink(e.target.value)} />
          <button
            type="button"
            className="btn-ghost px-4 text-sm"
            onClick={() => {
              const v = link.trim();
              if (v.startsWith("https://") && !value.photos.includes(v) && value.photos.length < MAX_THEME_PHOTOS) onChange({ ...value, photos: [...value.photos, v] });
              setLink("");
            }}
          >
            Adicionar
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="label mb-0">Vídeo curto (até {MAX_VIDEO_SECONDS}s)</span>
            {value.videoUrl && <button type="button" className="text-xs text-red-300" onClick={() => onChange({ ...value, videoUrl: null })}>Remover</button>}
          </div>
          {value.videoUrl ? (
            <video src={value.videoUrl} className="aspect-video w-full rounded-lg bg-black" controls playsInline preload="metadata" />
          ) : (
            <button type="button" disabled={!!busy} onClick={() => videoInput.current?.click()} className="flex aspect-video w-full items-center justify-center rounded-lg border-2 border-dashed border-gold/40 text-sm text-neutral-400 hover:border-gold hover:text-gold">
              ▶ Enviar vídeo (MP4, MOV ou WEBM, até {MB(MEDIA_LIMITS.video)} MB)
            </button>
          )}
          <input ref={videoInput} type="file" accept="video/mp4,video/quicktime,video/webm" hidden onChange={(e) => { setVideo(e.target.files?.[0]); e.target.value = ""; }} />
        </div>

        <div className="rounded-xl border border-white/10 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="label mb-0">GIF animado</span>
            {value.gifUrl && <button type="button" className="text-xs text-red-300" onClick={() => onChange({ ...value, gifUrl: null })}>Remover</button>}
          </div>
          {value.gifUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value.gifUrl} alt="GIF do tema" className="aspect-video w-full rounded-lg bg-black object-contain" />
          ) : (
            <button type="button" disabled={!!busy} onClick={() => gifInput.current?.click()} className="flex aspect-video w-full items-center justify-center rounded-lg border-2 border-dashed border-gold/40 text-sm text-neutral-400 hover:border-gold hover:text-gold">
              Enviar GIF (até {MB(MEDIA_LIMITS.gif)} MB)
            </button>
          )}
          <input ref={gifInput} type="file" accept="image/gif" hidden onChange={(e) => { setGif(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
      </div>
    </div>
  );
}
