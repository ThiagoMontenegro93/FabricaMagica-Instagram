import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@fabrica/db";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as upload } from "@/app/api/uploads/media/route";
import { GET as media } from "@/app/api/media/[...key]/route";
import { POST as createTheme } from "@/app/api/themes/route";
import { ADMIN, ATENDENTE, BASE, cookiesOf, ctx, req, resetDb } from "./helpers";

const dir = mkdtempSync(path.join(tmpdir(), "fm-uploads-"));
process.env.UPLOAD_DIR = dir;
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(200).fill(7)]);
const GIF = new Uint8Array([..."GIF89a"].map((c) => c.charCodeAt(0)).concat(new Array(200).fill(1)));
const MP4 = new Uint8Array([0, 0, 0, 0x20, ..."ftypisom"].map((c) => (typeof c === "string" ? c.charCodeAt(0) : c)).concat(new Array(500).fill(3)));
const HTML = new TextEncoder().encode("<html><script>alert(1)</script></html>".padEnd(200, " "));

function uploadReq(bytes: Uint8Array, name: string, token: string, kind?: string) {
  const form = new FormData();
  form.append("file", new File([bytes], name, { type: "image/jpeg" }));
  if (kind) form.append("kind", kind);
  return new NextRequest(`${BASE}/api/uploads/media`, { method: "POST", body: form, headers: { cookie: `fm_access=${token}` } });
}

const session = async (c: { email: string; password: string }) =>
  cookiesOf(await login(req("/api/auth/login", { method: "POST", body: c }), ctx)).fm_access!;

let admin: string;
beforeEach(async () => {
  await resetDb();
  admin = await session(ADMIN);
});

describe("Upload de mídia dos temas", () => {
  it("envia foto, GIF e vídeo; o tipo vem dos bytes, não do nome", async () => {
    const photo = await upload(uploadReq(JPEG, "festa.png", admin, "image"), ctx);
    expect(photo.status).toBe(201);
    const p = await photo.json();
    expect(p).toMatchObject({ kind: "image", mimeType: "image/jpeg", duplicate: false });
    expect(p.url).toMatch(/^\/api\/media\/.+\.jpg$/);

    expect((await (await upload(uploadReq(GIF, "a.gif", admin, "gif"), ctx)).json()).kind).toBe("gif");
    expect((await (await upload(uploadReq(MP4, "v.mp4", admin, "video"), ctx)).json()).kind).toBe("video");
    expect(await prisma.mediaAsset.count()).toBe(3);
  });

  it("recusa arquivo disfarçado, tipo trocado e quem não é dono", async () => {
    expect((await upload(uploadReq(HTML, "foto.jpg", admin), ctx)).status).toBe(400);
    expect((await upload(uploadReq(JPEG, "video.mp4", admin, "video"), ctx)).status).toBe(400);
    expect((await upload(uploadReq(JPEG, "a.jpg", await session(ATENDENTE)), ctx)).status).toBe(403);
    expect(await prisma.mediaAsset.count()).toBe(0);
  });

  it("mesmo arquivo duas vezes não duplica", async () => {
    const a = await (await upload(uploadReq(JPEG, "a.jpg", admin), ctx)).json();
    const b = await (await upload(uploadReq(JPEG, "b.jpg", admin), ctx)).json();
    expect(b.duplicate).toBe(true);
    expect(b.url).toBe(a.url);
  });

  it("serve o arquivo com tipo certo, cache e Range (vídeo no iPhone)", async () => {
    const { url } = await (await upload(uploadReq(MP4, "v.mp4", admin), ctx)).json();
    const key = url.replace("/api/media/", "").split("/");
    const full = await media(new NextRequest(`${BASE}${url}`), { params: { key } });
    expect(full.status).toBe(200);
    expect(full.headers.get("content-type")).toBe("video/mp4");
    expect(full.headers.get("x-content-type-options")).toBe("nosniff");

    const part = await media(new NextRequest(`${BASE}${url}`, { headers: { range: "bytes=0-9" } }), { params: { key } });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe(`bytes 0-9/${MP4.length}`);
    expect((await part.arrayBuffer()).byteLength).toBe(10);

    expect((await media(new NextRequest(`${BASE}/api/media/x`), { params: { key: ["..", "..", "etc", "passwd"] } })).status).toBe(404);
  });

  it("tema aceita várias fotos, vídeo, GIF e frete próprio", async () => {
    const photo = (await (await upload(uploadReq(JPEG, "a.jpg", admin), ctx)).json()).url;
    const gif = (await (await upload(uploadReq(GIF, "a.gif", admin), ctx)).json()).url;
    const video = (await (await upload(uploadReq(MP4, "a.mp4", admin), ctx)).json()).url;
    const res = await createTheme(
      req("/api/themes", {
        method: "POST",
        cookies: { fm_access: admin },
        body: {
          name: "Halloween",
          category: "Halloween Premium",
          description: "Fantasmas e abóboras de luxo",
          dailyPrice: 250000,
          photos: [photo, "https://cdn.exemplo.com/2.jpg"],
          videoUrl: video,
          gifUrl: gif,
          deliveryFee: 50000,
        },
      }),
      ctx,
    );
    expect(res.status).toBe(201);
    expect((await res.json()).theme).toMatchObject({ videoUrl: video, gifUrl: gif, deliveryFee: 50000 });

    const tooMany = await createTheme(
      req("/api/themes", {
        method: "POST",
        cookies: { fm_access: admin },
        body: { name: "X", category: "Y", description: "Descrição longa", dailyPrice: 1, photos: Array.from({ length: 21 }, (_, i) => `https://x.com/${i}.jpg`) },
      }),
      ctx,
    );
    expect(tooMany.status).toBe(400);
  });
});
