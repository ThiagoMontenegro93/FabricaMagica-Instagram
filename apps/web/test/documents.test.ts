import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@fabrica/db";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as createClient } from "@/app/api/clients/route";
import { GET as clientDetail } from "@/app/api/clients/[id]/route";
import { PATCH as verifyDocs } from "@/app/api/clients/[id]/verify-docs/route";
import { GET as docStatus, POST as uploadDoc } from "@/app/api/documents/route";
import { DELETE as deleteDoc } from "@/app/api/documents/[id]/route";
import { POST as docLink } from "@/app/api/documents/[id]/link/route";
import { GET as docFile } from "@/app/api/documents/[id]/file/route";
import { POST as cron } from "@/app/api/cron/rotina/route";
import { POST as createReservation } from "@/app/api/reservations/route";
import { ADMIN, ATENDENTE, BASE, cookiesOf, ctx, req, resetDb } from "./helpers";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 1, 2, 3]);
const PDF = new TextEncoder().encode("%PDF-1.4\n% documento de teste\n");
const EXE = new TextEncoder().encode("MZ\x90\x00 isto não é imagem");

let tenantId: string;
let token: string;
let clientId: string;

beforeEach(async () => {
  tenantId = (await resetDb()).id;
  token = cookiesOf(await register(req("/api/auth/register", { method: "POST", body: { email: "c@teste.com", password: "abcd1234" } }), ctx)).fm_access!;
  const res = await createClient(
    req("/api/clients", {
      method: "POST",
      cookies: { fm_access: token },
      body: {
        name: "Cliente Teste", cpf: "52998224725", rg: "123456", birthDate: "1990-01-01", email: "c@teste.com", whatsapp: "21999990000",
        address: { cep: "20770001", rua: "Rua A", numero: "1", bairro: "Méier", cidade: "Rio de Janeiro", estado: "RJ" },
        lgpdConsent: true, contractAccepted: true,
      },
    }),
    ctx,
  );
  clientId = (await res.json()).client.id;
});

const staff = async (c: { email: string; password: string }) =>
  cookiesOf(await login(req("/api/auth/login", { method: "POST", body: c }), ctx)).fm_access!;

function upload(kind: string, bytes: Uint8Array, name = "doc.jpg") {
  const form = new FormData();
  form.set("kind", kind);
  form.set("file", new Blob([bytes as Uint8Array<ArrayBuffer>]), name);
  return uploadDoc(new NextRequest(`${BASE}/api/documents`, { method: "POST", body: form, headers: { cookie: `fm_access=${token}` } }), ctx);
}
const enableDocs = (data: Record<string, unknown> = {}) =>
  prisma.tenantSettings.update({ where: { tenantId }, data: { hostSensitiveDocs: true, ...data } });

describe("documentos sensíveis", () => {
  it("com a hospedagem desligada, nada é aceito", async () => {
    expect((await upload("RG_FRENTE", JPEG)).status).toBe(403);
    const s = await (await docStatus(req("/api/documents", { cookies: { fm_access: token } }), ctx)).json();
    expect(s.mode).toBe("WHATSAPP");
    expect(await prisma.clientDocument.count()).toBe(0);
  });

  it("criptografa no disco, confere o conteúdo e substitui o mesmo tipo", async () => {
    await enableDocs({ retentionDays: 30 });
    expect((await upload("RG_FRENTE", EXE, "foto.jpg")).status).toBe(400);
    const res = await upload("RG_FRENTE", JPEG);
    expect(res.status).toBe(201);

    const doc = await prisma.clientDocument.findFirstOrThrow();
    const onDisk = await readFile(path.join(process.env.DOCS_DIR!, doc.storageKey));
    expect(Buffer.from(onDisk).includes(Buffer.from(JPEG))).toBe(false);
    const days = (doc.retainUntil.getTime() - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(30);

    expect((await upload("RG_FRENTE", PDF, "rg.pdf")).status).toBe(201);
    expect(await prisma.clientDocument.count()).toBe(1);
    const dir = path.join(process.env.DOCS_DIR!, "docs", tenantId, clientId);
    expect((await readdir(dir)).length).toBe(1);
  });

  it("equipe abre por link de 15 min com sessão; tudo vai para o AuditLog", async () => {
    await enableDocs();
    const { document } = await (await upload("RG_FRENTE", JPEG)).json();
    const atendente = await staff(ATENDENTE);

    expect((await docLink(req(`/api/documents/${document.id}/link`, { method: "POST", cookies: { fm_access: token } }), { params: { id: document.id } })).status).toBe(403);
    const link = await (await docLink(req(`/api/documents/${document.id}/link`, { method: "POST", cookies: { fm_access: atendente } }), { params: { id: document.id } })).json();
    const url = new URL(link.url, BASE);

    const open = (t: string, cookie?: string) =>
      docFile(req(`${url.pathname}?t=${t}`, cookie ? { cookies: { fm_access: cookie } } : {}), { params: { id: document.id } });
    const ok = await open(url.searchParams.get("t")!, atendente);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toContain("no-store");
    expect(new Uint8Array(await ok.arrayBuffer())).toEqual(JPEG);

    expect((await open(url.searchParams.get("t")!)).status).toBe(401);
    expect((await open("123.abc", atendente)).status).toBe(403);
    expect((await open(`1.${url.searchParams.get("t")!.split(".")[1]}`, atendente)).status).toBe(403);
    expect(await prisma.auditLog.count({ where: { action: "ACCESS_DOC" } })).toBe(1);
  });

  it("bloqueia reserva sem documentos e libera depois de enviar", async () => {
    await enableDocs({ blockWithoutDocs: true, requireProof: true });
    const theme = await prisma.partyTheme.create({ data: { tenantId, slug: "t", name: "Tema", category: "X", description: "Tema de teste", dailyPrice: 1000 } });
    const date = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const body = { eventDate: date, deliveryType: "RETIRADA", themes: [{ themeId: theme.id }] };
    const reserve = () => createReservation(req("/api/reservations", { method: "POST", body, cookies: { fm_access: token } }), ctx);

    const blocked = await reserve();
    expect(blocked.status).toBe(409);
    expect((await blocked.json()).error.code).toBe("DOCS_REQUIRED");

    await upload("RG_FRENTE", JPEG);
    await upload("RG_VERSO", new Uint8Array([...JPEG, 9]));
    await upload("COMPROVANTE_RESIDENCIA", PDF);
    expect((await reserve()).status).toBe(201);
  });

  it("equipe confere; novo envio pede nova conferência; cliente apaga o próprio", async () => {
    await enableDocs();
    const { document } = await (await upload("RG_FRENTE", JPEG)).json();
    const atendente = await staff(ATENDENTE);
    const dono = await staff(ADMIN);

    const v = await verifyDocs(req(`/api/clients/${clientId}/verify-docs`, { method: "PATCH", body: { verified: true }, cookies: { fm_access: atendente } }), { params: { id: clientId } });
    expect((await v.json()).docsVerifiedAt).not.toBeNull();

    const asAtendente = await (await clientDetail(req(`/api/clients/${clientId}`, { cookies: { fm_access: atendente } }), { params: { id: clientId } })).json();
    expect(asAtendente.client.cpf).toMatch(/^\*\*\*/);
    expect(asAtendente.documents.documents).toHaveLength(1);
    const asDono = await (await clientDetail(req(`/api/clients/${clientId}`, { cookies: { fm_access: dono } }), { params: { id: clientId } })).json();
    expect(asDono.client.cpf).toBe("529.982.247-25");

    expect((await deleteDoc(req(`/api/documents/${document.id}`, { method: "DELETE", cookies: { fm_access: token } }), { params: { id: document.id } })).status).toBe(200);
    expect(await prisma.clientDocument.count()).toBe(0);
    expect((await prisma.client.findUniqueOrThrow({ where: { id: clientId } })).docsVerifiedAt).toBeNull();
  });

  it("rotina apaga documentos vencidos e exige o segredo", async () => {
    await enableDocs();
    await upload("RG_FRENTE", JPEG);
    await prisma.clientDocument.updateMany({ data: { retainUntil: new Date(Date.now() - 1000) } });

    expect((await cron(req("/api/cron/rotina", { method: "POST" }), ctx)).status).toBe(401);
    const res = await cron(req("/api/cron/rotina", { method: "POST", headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }), ctx);
    expect((await res.json()).purgedDocuments).toBe(1);
    expect(await prisma.clientDocument.count()).toBe(0);
  });
});
