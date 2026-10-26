import { beforeEach, describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as listThemes, POST as createTheme } from "@/app/api/themes/route";
import { GET as getTheme, PATCH as patchTheme } from "@/app/api/themes/[id]/route";
import { PATCH as patchSettings } from "@/app/api/tenant/settings/route";
import { GET as publicSettings } from "@/app/api/tenant/public-settings/route";
import { ADMIN, ATENDENTE, cookiesOf, ctx, req, resetDb } from "./helpers";

const session = async (c: { email: string; password: string }) =>
  cookiesOf(await login(req("/api/auth/login", { method: "POST", body: c }), ctx)).fm_access!;

const base = { category: "Halloween Premium", description: "Tema completo com painel e mesa", dailyPrice: 250000, totalQty: 1 };

let admin: string;
beforeEach(async () => {
  await resetDb();
  admin = await session(ADMIN);
});

async function create(body: Record<string, unknown>) {
  const res = await createTheme(req("/api/themes", { method: "POST", body: { ...base, ...body }, cookies: { fm_access: admin } }), ctx);
  return { res, theme: res.status === 201 || res.status === 200 ? (await res.json()).theme : null };
}

const settings = (body: unknown, token = admin) =>
  patchSettings(req("/api/tenant/settings", { method: "PATCH", body, cookies: { fm_access: token } }), ctx);

describe("aluguel, venda e entrega", () => {
  it("tema sem configuração segue a loja e muda quando a loja muda", async () => {
    const { theme } = await create({ name: "Mickey" });
    const get = async () => (await (await getTheme(req(`/api/themes/${theme.id}`), { params: { id: theme.id } })).json()).theme;

    let t = await get();
    expect(t.offer.deals).toEqual(["ALUGUEL"]);
    expect(t.offer.deliveryTypes).toEqual(["RETIRADA", "ENTREGA"]);

    expect((await settings({ allowPickup: false })).status).toBe(200);
    t = await get();
    expect(t.offer.deliveryTypes).toEqual(["ENTREGA"]);

    const pub = await (await publicSettings(req("/api/tenant/public-settings"), ctx)).json();
    expect(pub.allowPickup).toBe(false);
    expect(pub.allowDelivery).toBe(true);
  });

  it("loja não pode desligar retirada e entrega ao mesmo tempo", async () => {
    expect((await settings({ allowPickup: false, allowDelivery: false })).status).toBe(400);
    expect((await settings({ allowPickup: false })).status).toBe(200);
    expect((await settings({ allowDelivery: false })).status).toBe(400);
  });

  it("vender exige preço de venda, inclusive ao editar", async () => {
    expect((await create({ name: "Sem preço", offerMode: "VENDA" })).res.status).toBe(400);

    const { theme } = await create({ name: "Halloween", offerMode: "AMBOS", salePrice: 900000, saleQty: 1 });
    expect(theme.offer.deals).toEqual(["ALUGUEL", "VENDA"]);

    const patch = (body: unknown) =>
      patchTheme(req(`/api/themes/${theme.id}`, { method: "PATCH", body, cookies: { fm_access: admin } }), { params: { id: theme.id } });
    expect((await patch({ salePrice: null })).status).toBe(400);
    expect((await patch({ allowPickup: false, allowDelivery: false })).status).toBe(400);
    expect((await patch({ offerMode: "ALUGUEL", salePrice: null })).status).toBe(200);
  });

  it("atendente não muda forma de venda", async () => {
    const { theme } = await create({ name: "Bela" });
    const atendente = await session(ATENDENTE);
    const res = await patchTheme(
      req(`/api/themes/${theme.id}`, { method: "PATCH", body: { offerMode: "VENDA", salePrice: 100 }, cookies: { fm_access: atendente } }),
      { params: { id: theme.id } },
    );
    expect(res.status).toBe(403);
  });

  it("catálogo filtra por alugar e comprar", async () => {
    await create({ name: "Só aluguel" });
    await create({ name: "Só venda", offerMode: "VENDA", salePrice: 500000, saleQty: 2 });
    await create({ name: "Os dois", offerMode: "AMBOS", salePrice: 900000, saleQty: 1 });
    await create({ name: "Venda esgotada", offerMode: "VENDA", salePrice: 500000, saleQty: 0 });

    const names = async (tipo: string) =>
      (await (await listThemes(req(`/api/themes?tipo=${tipo}`), ctx)).json()).items.map((t: { name: string }) => t.name).sort();
    expect(await names("aluguel")).toEqual(["Os dois", "Só aluguel"]);
    expect(await names("venda")).toEqual(["Os dois", "Só venda"]);
    expect((await listThemes(req("/api/themes?tipo=troca"), ctx)).status).toBe(400);
  });
});
