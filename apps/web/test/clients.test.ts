import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@fabrica/db";
import { MIN_AGE_MESSAGE } from "@fabrica/shared";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as register } from "@/app/api/auth/register/route";
import { GET as listClients, POST as createClient } from "@/app/api/clients/route";
import { PATCH as patchSettings } from "@/app/api/tenant/settings/route";
import { ADMIN, ATENDENTE, cookiesOf, ctx, req, resetDb } from "./helpers";

const validClient = {
  name: "Morticia Addams",
  cpf: "529.982.247-25",
  rg: "12.345.678-9",
  birthDate: "1990-05-10",
  email: "morticia@teste.com",
  whatsapp: "(21) 99999-0000",
  address: { cep: "20770-001", rua: "Av. Dom Helder Câmara", numero: "6001", bairro: "Engenho de Dentro", cidade: "Rio de Janeiro", estado: "RJ" },
  lgpdConsent: true,
  contractAccepted: true,
};

async function clienteSession(email = "morticia@teste.com") {
  return cookiesOf(await register(req("/api/auth/register", { method: "POST", body: { email, password: "abcd1234" } }), ctx)).fm_access!;
}
async function staff(creds: { email: string; password: string }) {
  return cookiesOf(await login(req("/api/auth/login", { method: "POST", body: creds }), ctx)).fm_access!;
}
const post = (token: string, body: unknown) => createClient(req("/api/clients", { method: "POST", body, cookies: { fm_access: token } }), ctx);

beforeEach(async () => {
  await resetDb();
});

describe("RF06 - cadastro de locação", () => {
  it("exige login", async () => {
    expect((await createClient(req("/api/clients", { method: "POST", body: validClient }), ctx)).status).toBe(401);
  });

  it("RN01: menor de 18 é bloqueado no back com a mensagem oficial", async () => {
    const token = await clienteSession();
    const today = new Date();
    const birth = `${today.getUTCFullYear() - 17}-01-01`;
    const res = await post(token, { ...validClient, birthDate: birth });
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toBe(MIN_AGE_MESSAGE);
    expect(await prisma.client.count()).toBe(0);
  });

  it("RN04 e RN11: CPF inválido e termos não aceitos são recusados", async () => {
    const token = await clienteSession();
    expect((await post(token, { ...validClient, cpf: "123.456.789-00" })).status).toBe(400);
    expect((await post(token, { ...validClient, lgpdConsent: false })).status).toBe(400);
    expect((await post(token, { ...validClient, contractAccepted: false })).status).toBe(400);
  });

  it("cria cadastro vinculado ao login, normalizado, com aceite datado e versão do contrato", async () => {
    const token = await clienteSession();
    const res = await post(token, validClient);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.documentVerification.mode).toBe("WHATSAPP");
    expect(body.documentVerification.link).toMatch(/^https:\/\/wa\.me\/5521972848645\?text=/);

    const c = await prisma.client.findFirstOrThrow({ include: { user: true } });
    expect(c.cpf).toBe("52998224725");
    expect(c.whatsapp).toBe("21999990000");
    expect(c.user?.email).toBe("morticia@teste.com");
    expect(c.lgpdConsentAt).toBeInstanceOf(Date);
    expect(c.contractVersion).toBeTruthy();
    expect(c.birthDate.toISOString().slice(0, 10)).toBe("1990-05-10");
  });

  it("RN05: com documentos desligados, campos de arquivo enviados são descartados", async () => {
    const token = await clienteSession();
    const res = await post(token, { ...validClient, documentUrls: { rgFrente: "https://x/rg.jpg" }, documents: ["data:..."] });
    expect(res.status).toBe(201);
    expect(await prisma.clientDocument.count()).toBe(0);
  });

  it("com documentos ligados, a resposta orienta o upload", async () => {
    const admin = await staff(ADMIN);
    await patchSettings(req("/api/tenant/settings", { method: "PATCH", body: { hostSensitiveDocs: true, requireSelfie: true }, cookies: { fm_access: admin } }), ctx);
    const res = await post(await clienteSession(), validClient);
    expect((await res.json()).documentVerification).toEqual({ mode: "UPLOAD", requireProof: true, requireSelfie: true });
  });

  it("um cadastro por conta e CPF único por tenant", async () => {
    const token = await clienteSession();
    expect((await post(token, validClient)).status).toBe(201);
    expect((await post(token, { ...validClient, cpf: "111.444.777-35" })).status).toBe(409);
    const other = await clienteSession("outro@teste.com");
    const dup = await post(other, { ...validClient, email: "outro@teste.com" });
    expect(dup.status).toBe(409);
    expect((await dup.json()).error.message).toContain("CPF");
  });

  it("atendente faz cadastro manual (sem login vinculado)", async () => {
    const res = await post(await staff(ATENDENTE), validClient);
    expect(res.status).toBe(201);
    expect((await prisma.client.findFirstOrThrow()).userId).toBeNull();
  });
});

describe("Lista de clientes (equipe)", () => {
  it("cliente não lista; atendente vê CPF mascarado; dono vê completo; tudo auditado", async () => {
    await post(await clienteSession(), validClient);
    const cliente = await clienteSession("x@teste.com");
    expect((await listClients(req("/api/clients", { cookies: { fm_access: cliente } }), ctx)).status).toBe(403);

    const att = await (await listClients(req("/api/clients?q=morticia", { cookies: { fm_access: await staff(ATENDENTE) } }), ctx)).json();
    expect(att.items).toHaveLength(1);
    expect(att.items[0].cpf).toBe("***.982.247-**");

    const adm = await (await listClients(req("/api/clients?q=529982", { cookies: { fm_access: await staff(ADMIN) } }), ctx)).json();
    expect(adm.items[0].cpf).toBe("529.982.247-25");
    expect(await prisma.auditLog.count({ where: { action: "VIEW_CLIENTS" } })).toBe(2);
  });
});
