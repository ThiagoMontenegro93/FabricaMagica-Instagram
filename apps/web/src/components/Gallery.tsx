"use client";

import { useState } from "react";
import { ThemeCover } from "./ThemeCard";

type Item = { type: "photo" | "gif" | "video"; url: string };

/** Galeria do tema: fotos, GIF e vídeo curto, com miniaturas. */
export function Gallery({ name, photos, gifUrl, videoUrl }: { name: string; photos: string[]; gifUrl?: string | null; videoUrl?: string | null }) {
  const items: Item[] = [
    ...photos.map((url) => ({ type: "photo" as const, url })),
    ...(videoUrl ? [{ type: "video" as const, url: videoUrl }] : []),
    ...(gifUrl ? [{ type: "gif" as const, url: gifUrl }] : []),
  ];
  const [active, setActive] = useState(0);
  const current = items[active];

  return (
    <div className="space-y-3">
      <div className="neon-frame aspect-square overflow-hidden bg-black">
        {!current ? (
          <ThemeCover name={name} photos={[]} />
        ) : current.type === "video" ? (
          <video key={current.url} src={current.url} className="h-full w-full object-contain" controls playsInline preload="metadata" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current.url} alt={name} className="h-full w-full object-cover" />
        )}
      </div>
      {items.length > 1 && (
        <ul className="grid grid-cols-5 gap-2">
          {items.map((it, i) => (
            <li key={it.url}>
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-label={`${it.type === "video" ? "Vídeo" : it.type === "gif" ? "GIF" : "Foto"} ${i + 1}`}
                className={`relative block aspect-square w-full overflow-hidden rounded-lg border-2 ${i === active ? "border-gold" : "border-transparent opacity-70 hover:opacity-100"}`}
              >
                {it.type === "video" ? (
                  <span className="flex h-full w-full items-center justify-center bg-neutral-900 text-2xl text-gold">▶</span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                )}
                {it.type === "gif" && <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[10px] text-neon-green">GIF</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
