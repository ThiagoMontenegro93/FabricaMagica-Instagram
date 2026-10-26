import { describe, expect, it } from "vitest";
import { isMediaUrl, sniffMedia } from "../src";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)).concat(new Array(16).fill(0)));

describe("sniffMedia (tipo real do arquivo)", () => {
  it("reconhece imagens, GIF e vídeos", () => {
    expect(sniffMedia(bytes([0xff, 0xd8, 0xff, 0xe0]))).toEqual({ mime: "image/jpeg", kind: "image" });
    expect(sniffMedia(bytes("\x89PNG\r\n\x1a\n"))).toEqual({ mime: "image/png", kind: "image" });
    expect(sniffMedia(bytes("RIFF", [0, 0, 0, 0], "WEBP"))).toEqual({ mime: "image/webp", kind: "image" });
    expect(sniffMedia(bytes("GIF89a"))).toEqual({ mime: "image/gif", kind: "gif" });
    expect(sniffMedia(bytes([0, 0, 0, 0x20], "ftypisom"))).toEqual({ mime: "video/mp4", kind: "video" });
    expect(sniffMedia(bytes([0, 0, 0, 0x14], "ftypqt  "))).toEqual({ mime: "video/quicktime", kind: "video" });
    expect(sniffMedia(bytes([0x1a, 0x45, 0xdf, 0xa3]))).toEqual({ mime: "video/webm", kind: "video" });
  });
  it("recusa HTML/SVG/executável disfarçados", () => {
    expect(sniffMedia(bytes("<html><script>"))).toBeNull();
    expect(sniffMedia(bytes("<svg xmlns="))).toBeNull();
    expect(sniffMedia(bytes("MZ\x90\x00"))).toBeNull();
    expect(sniffMedia(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });
});

describe("isMediaUrl", () => {
  it("aceita https e arquivos enviados; recusa o resto", () => {
    expect(isMediaUrl("https://cdn.exemplo.com/a.jpg")).toBe(true);
    expect(isMediaUrl("/api/media/tenant/2026/abc.jpg")).toBe(true);
    expect(isMediaUrl("http://x.com/a.jpg")).toBe(false);
    expect(isMediaUrl("javascript:alert(1)")).toBe(false);
    expect(isMediaUrl("/api/media/../../etc/passwd")).toBe(false);
    expect(isMediaUrl("/outra/rota.jpg")).toBe(false);
  });
});
