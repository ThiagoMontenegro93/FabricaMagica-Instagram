import { beforeEach, describe, expect, it } from "vitest";
import { prisma, type ReservationStatus } from "@fabrica/db";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as listThemes, POST as createTheme } from "@/app/api/themes/route";
import { DELETE as deleteTheme, GET as getTheme, PATCH as patchTheme } from "@/app/api/themes/[id]/route";
import { ADMIN, ATENDENTE, cookiesOf, ctx, req, resetDb } from "./helpers";

const session = async (c: { email: string; password: string }) =>
  cookiesOf(await login(req("/api/auth/login", { method: "POST", body: c }), ctx)).fm_access!;

const theme = (over: Record<string, unknown> = {}) => ({
  name: "Harry Potter",
  category: "Personagens e Filmes",
  description: "Salão de Hogwarts com velas e brasões",
  dailyPrice: 70000,
  totalQty: 2,
  ...over,
});

let tenantId: string;
let admin: string;

beforeEach(async () => {
  tenantId = (await resetDb()).id;
  admin = await session(ADMIN);
});

async function create(body: unknown, token = admin) {
  return createTheme(req("/api/themes", { method: "POST", body, cookies: { fm_access: token } }), ctx);
}

/** Cria uma reserva direto no banco ocupando `quantity` kits do tema. */
async function reserve(themeId: string, status: ReservationStatus, eventDate: string, returnDate: string, quantity = 1, holdExpiresAt?: Date) {
  const client = await prisma.client.create({
    data: {
      tenantId,
      name: "Cliente Teste",
      cpf: String(Math.floor(Math.random() * 1e11)).padStart(11, "0"),
      rg: "123",
      birthDate: new Date("1990-01-01"),
      email: "c@t.com",
      whatsapp: "21999990000",
      address: {},
      lgpdConsent: true,
      contractAccepted: true,
    },
  });
  await prisma.reservation.create({
    data: {
      tenantId,
      clientId: client.id,
      code: `FM-${Math.random().toString(36).slice(2, 8)}`,
      eventDate: new Date(`${eventDate}T00:00:00Z`),
      returnDate: new Date(`${returnDate}T00:00:00Z`),
      deliveryType: "RETIRADA",
      subtotal: 0,
      totalPrice: 0,
      status,
      holdExpiresAt,
      themes: { create: { themeId, quantity, unitPrice: 0 } },
    },
  });
}

describe("RF02 - cadastro de temas pelo dono", () => {
  it("cria sem limite de quantidade, com slug amigável e único", async () => {
    for (let i = 0; i < 30; i++) {
      expect((await create(theme({ name: `Tema ${i}` }))).status).toBe(201);
    }
    const a = await (await create(theme({ name: "A Bela e a Fera" }))).json();
    const b = await (await create(theme({ name: "A Bela e a Fera" }))).json();
    expect(a.theme.slug).toBe("a-bela-e-a-fera");
    expect(b.theme.slug).toBe("a-bela-e-a-fera-2");
    expect(await prisma.partyTheme.count()).toBe(32);
    expect(await prisma.auditLog.count({ where: { action: "THEME_CREATE" } })).toBe(32);
  });

  it("aceita categoria nova e recusa dados inválidos", async () => {
    expect((await create(theme({ category: "Festa Junina" }))).status).toBe(201);
    expect((await create(theme({ dailyPrice: -1 }))).status).toBe(400);
    expect((await create(theme({ photos: ["javascript:alert(1)"] }))).status).toBe(400);
  });

  it("só o dono cadastra; atendente só muda o status", async () => {
    const att = await session(ATENDENTE);
    expect((await create(theme(), att)).status).toBe(403);
    expect((await create(theme(), "")).status).toBe(401);

    const { theme: t } = await (await create(theme())).json();
    const patch = (body: unknown, token: string) =>
      patchTheme(req(`/api/themes/${t.id}`, { method: "PATCH", body, cookies: { fm_access: token } }), { params: { id: t.id } });

    expect((await patch({ dailyPrice: 1 }, att)).status).toBe(403);
    expect((await patch({ status: "MANUTENCAO" }, att)).status).toBe(200);
    const edited = await (await patch({ dailyPrice: 99000, name: "Harry Potter Deluxe" }, admin)).json();
    expect(edited.theme).toMatchObject({ dailyPrice: 99000, name: "Harry Potter Deluxe", slug: "harry-potter" });
  });
});

describe("RF14 - catálogo público", () => {
  it("lista ativos e em manutenção, esconde descontinuados, filtra e conta categorias", async () => {
    await create(theme({ name: "O Rei Leão" }));
    await create(theme({ name: "Halloween", category: "Halloween Premium" }));
    await create(theme({ name: "Antigo", status: "DESCONTINUADO" }));
    await create(theme({ name: "Mickey Mouse", status: "MANUTENCAO" }));

    const all = await (await listThemes(req("/api/themes"), ctx)).json();
    expect(all.items.map((t: { name: string }) => t.name).sort()).toEqual(["Halloween", "Mickey Mouse", "O Rei Leão"]);
    expect(all.categories).toEqual([
      { name: "Halloween Premium", count: 1 },
      { name: "Personagens e Filmes", count: 2 },
    ]);

    const filtered = await (await listThemes(req("/api/themes?category=halloween%20premium"), ctx)).json();
    expect(filtered.items).toHaveLength(1);
    const search2 = await (await listThemes(req("/api/themes?q=Leão"), ctx)).json();
    expect(search2.items).toHaveLength(1);

    const staffAll = await (await listThemes(req("/api/themes?all=1", { cookies: { fm_access: admin } }), ctx)).json();
    expect(staffAll.items).toHaveLength(4);
    const publicAll = await (await listThemes(req("/api/themes?all=1"), ctx)).json();
    expect(publicAll.items).toHaveLength(3);
  });

  it("busca por slug e 404 para tema descontinuado", async () => {
    await create(theme({ name: "O Rei Leão" }));
    const { theme: hidden } = await (await create(theme({ name: "Oculto", status: "DESCONTINUADO" }))).json();
    expect((await getTheme(req("/api/themes/o-rei-leao"), { params: { id: "o-rei-leao" } })).status).toBe(200);
    expect((await getTheme(req(`/api/themes/${hidden.id}`), { params: { id: hidden.id } })).status).toBe(404);
  });
});

describe("RF08 / RN02 - estoque por data", () => {
  it("desconta reservas que se sobrepõem e ignora canceladas, devolvidas e holds vencidos", async () => {
    const { theme: t } = await (await create(theme({ totalQty: 3 }))).json();
    await reserve(t.id, "PAGO", "2026-10-31", "2026-11-01");
    await reserve(t.id, "EM_LOCACAO", "2026-10-30", "2026-10-31");
    await reserve(t.id, "CANCELADO", "2026-10-31", "2026-10-31");
    await reserve(t.id, "DEVOLVIDO", "2026-10-31", "2026-10-31");
    await reserve(t.id, "PENDENTE", "2026-10-31", "2026-10-31", 1, new Date(Date.now() - 60_000));
    await reserve(t.id, "PAGO", "2026-11-05", "2026-11-06");

    const on31 = await (await listThemes(req("/api/themes?availableOn=2026-10-31"), ctx)).json();
    expect(on31.items[0].availableQty).toBe(1);

    await reserve(t.id, "PENDENTE", "2026-10-31", "2026-10-31", 1, new Date(Date.now() + 10 * 60_000));
    const again = await (await listThemes(req("/api/themes?availableOn=2026-10-31"), ctx)).json();
    expect(again.items[0].availableQty).toBe(0);

    const free = await (await listThemes(req("/api/themes?availableOn=2026-11-10"), ctx)).json();
    expect(free.items[0].availableQty).toBe(3);
    const noDate = await (await listThemes(req("/api/themes"), ctx)).json();
    expect(noDate.items[0].availableQty).toBeNull();
  });

  it("tema em manutenção aparece com disponibilidade zero", async () => {
    await create(theme({ status: "MANUTENCAO" }));
    const r = await (await listThemes(req("/api/themes?availableOn=2026-11-10"), ctx)).json();
    expect(r.items[0].availableQty).toBe(0);
  });

  it("valida datas", async () => {
    expect((await listThemes(req("/api/themes?availableOn=2026-02-30"), ctx)).status).toBe(400);
    expect((await listThemes(req("/api/themes?availableOn=2026-11-10&returnOn=2026-11-09"), ctx)).status).toBe(400);
  });

  it("não exclui tema com reserva em aberto; exclui (lógico) quando livre", async () => {
    const { theme: busy } = await (await create(theme({ name: "Ocupado" }))).json();
    const { theme: free } = await (await create(theme({ name: "Livre" }))).json();
    const future = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    await reserve(busy.id, "PAGO", future, future);

    const del = (id: string) => deleteTheme(req(`/api/themes/${id}`, { method: "DELETE", cookies: { fm_access: admin } }), { params: { id } });
    expect((await del(busy.id)).status).toBe(409);
    expect((await del(free.id)).status).toBe(200);
    const row = await prisma.partyTheme.findUniqueOrThrow({ where: { id: free.id } });
    expect(row.deletedAt).not.toBeNull();
    expect(row.status).toBe("DESCONTINUADO");
  });
});
