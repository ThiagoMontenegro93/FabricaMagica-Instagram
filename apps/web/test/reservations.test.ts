import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@fabrica/db";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as createClient } from "@/app/api/clients/route";
import { GET as listReservations, POST as createReservation } from "@/app/api/reservations/route";
import { POST as quote } from "@/app/api/reservations/quote/route";
import { GET as getReservation } from "@/app/api/reservations/[id]/route";
import { PATCH as patchStatus } from "@/app/api/reservations/[id]/status/route";
import { ADMIN, ATENDENTE, cookiesOf, ctx, req, resetDb } from "./helpers";

const address = { cep: "20770-001", rua: "Av. Dom Helder Câmara", numero: "6001", bairro: "Engenho de Dentro", cidade: "Rio de Janeiro", estado: "RJ" };
const CPFS = ["52998224725", "11144477735", "39053344705"];

/** Próximo sábado com pelo menos 7 dias de folga. */
function nextSaturday(): string {
  const d = new Date(Date.now() + 7 * 86_400_000);
  while (d.getUTCDay() !== 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
const SAT = nextSaturday();

let tenantId: string;
let themeId: string;
let characterId: string;

beforeEach(async () => {
  tenantId = (await resetDb()).id;
  await prisma.tenantSettings.update({ where: { tenantId }, data: { deliveryFeeBase: 40000, lateFeePerDay: 10000 } });
  themeId = (
    await prisma.partyTheme.create({
      data: {
        tenantId, slug: "halloween", name: "Halloween", category: "Halloween Premium", description: "Tema completo",
        dailyPrice: 250000, totalQty: 1, offerMode: "AMBOS", salePrice: 900000, saleQty: 1,
      },
    })
  ).id;
  characterId = (
    await prisma.liveCharacter.create({ data: { tenantId, slug: "dracula", name: "Drácula", pricePer2h: 45000, priceExtraHour: 18000 } })
  ).id;
});

let cpfIndex = 0;
async function cliente(email: string, withProfile = true) {
  const token = cookiesOf(await register(req("/api/auth/register", { method: "POST", body: { email, password: "abcd1234" } }), ctx)).fm_access!;
  if (withProfile) {
    const res = await createClient(
      req("/api/clients", {
        method: "POST",
        cookies: { fm_access: token },
        body: { name: "Cliente Teste", cpf: CPFS[cpfIndex++ % CPFS.length], rg: "123456", birthDate: "1990-01-01", email, whatsapp: "21999990000", address, lgpdConsent: true, contractAccepted: true },
      }),
      ctx,
    );
    expect(res.status).toBe(201);
  }
  return token;
}
const staff = async (c: { email: string; password: string }) =>
  cookiesOf(await login(req("/api/auth/login", { method: "POST", body: c }), ctx)).fm_access!;

const order = (over: Record<string, unknown> = {}) => ({
  eventDate: SAT,
  returnDate: SAT,
  deliveryType: "ENTREGA",
  themes: [{ themeId, quantity: 1 }],
  ...over,
});
const reserve = (token: string, body: unknown) =>
  createReservation(req("/api/reservations", { method: "POST", body, cookies: { fm_access: token } }), ctx);
const setStatus = (token: string, id: string, status: string) =>
  patchStatus(req(`/api/reservations/${id}/status`, { method: "PATCH", body: { status }, cookies: { fm_access: token } }), { params: { id } });

beforeEach(() => {
  cpfIndex = 0;
});

describe("cotação", () => {
  it("calcula aluguel no sábado com taxa extra e frete, sem login", async () => {
    const res = await quote(req("/api/reservations/quote", { method: "POST", body: order() }), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.quote.total).toBe(250000 + 75000 + 40000);
    expect(body.unavailable).toEqual([]);
  });

  it("personagem soma 2h + horas extras e retirada não cobra frete", async () => {
    const body = order({ deliveryType: "RETIRADA", characters: [{ characterId, startsAt: `${SAT}T15:00:00-03:00`, extraHours: 1 }] });
    const q = await (await quote(req("/api/reservations/quote", { method: "POST", body }), ctx)).json();
    expect(q.quote.charactersSubtotal).toBe(63000);
    expect(q.quote.deliveryFee).toBe(0);
  });

  it("recusa data no passado", async () => {
    const res = await quote(req("/api/reservations/quote", { method: "POST", body: order({ eventDate: "2020-01-01", returnDate: "2020-01-01" }) }), ctx);
    expect(res.status).toBe(400);
  });
});

describe("reserva sem overbooking", () => {
  it("exige cadastro de locação completo", async () => {
    const token = await cliente("sem@perfil.com", false);
    expect((await reserve(token, order())).status).toBe(409);
  });

  it("segura o último kit por 30 min e libera quando o prazo vence", async () => {
    const a = await cliente("a@teste.com");
    const b = await cliente("b@teste.com");
    const first = await reserve(a, order());
    expect(first.status).toBe(201);
    const r = (await first.json()).reservation;
    expect(r.status).toBe("PENDENTE");
    expect(r.code).toMatch(/^FM-[A-Z2-9]{6}$/);
    expect(r.totalPrice).toBe(365000);
    expect(r.deliveryAddress.cep).toBe("20770001");

    expect((await reserve(b, order())).status).toBe(409);

    await prisma.reservation.update({ where: { id: r.id }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });
    expect((await reserve(b, order())).status).toBe(201);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("CANCELADO");
  });

  it("dois pedidos ao mesmo tempo pelo último kit: só um passa", async () => {
    const tokens = await Promise.all(["c1@t.com", "c2@t.com", "c3@t.com"].map((e) => cliente(e)));
    const results = await Promise.all(tokens.map((t) => reserve(t, order())));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
  });

  it("personagem não fica em duas festas e o cancelamento libera o horário", async () => {
    const a = await cliente("a@teste.com");
    const b = await cliente("b@teste.com");
    const withChar = (h: string) => ({ eventDate: SAT, deliveryType: "RETIRADA", characters: [{ characterId, startsAt: `${SAT}T${h}:00-03:00` }] });
    const first = await (await reserve(a, withChar("15:00"))).json();
    expect((await reserve(b, withChar("16:00"))).status).toBe(409);
    expect((await reserve(b, withChar("17:00"))).status).toBe(201);

    expect((await setStatus(a, first.reservation.id, "CANCELADO")).status).toBe(200);
    expect(await prisma.characterSchedule.count({ where: { characterId } })).toBe(1);
  });

  it("venda baixa as unidades à venda e o cancelamento devolve", async () => {
    const a = await cliente("a@teste.com");
    const res = await reserve(a, order({ dealType: "VENDA", deliveryType: "RETIRADA" }));
    expect(res.status).toBe(201);
    const r = (await res.json()).reservation;
    expect(r.totalPrice).toBe(900000);
    expect(r.weekendFee).toBe(0);
    expect((await prisma.partyTheme.findUniqueOrThrow({ where: { id: themeId } })).saleQty).toBe(0);
    // Venda não ocupa o kit de aluguel.
    expect((await reserve(await cliente("b@teste.com"), order())).status).toBe(201);

    await setStatus(a, r.id, "CANCELADO");
    expect((await prisma.partyTheme.findUniqueOrThrow({ where: { id: themeId } })).saleQty).toBe(1);
  });

  it("respeita o modo do tema e a forma de entrega", async () => {
    await prisma.partyTheme.update({ where: { id: themeId }, data: { offerMode: "ALUGUEL", allowDelivery: false } });
    const a = await cliente("a@teste.com");
    expect((await reserve(a, order({ dealType: "VENDA", deliveryType: "RETIRADA" }))).status).toBe(400);
    expect((await reserve(a, order())).status).toBe(400);
    expect((await reserve(a, order({ deliveryType: "RETIRADA" }))).status).toBe(201);
  });
});

describe("acesso e status", () => {
  it("cliente vê só as próprias reservas e só cancela a pendente", async () => {
    const a = await cliente("a@teste.com");
    const b = await cliente("b@teste.com");
    const r = (await (await reserve(a, order())).json()).reservation;

    const mine = await (await listReservations(req("/api/reservations", { cookies: { fm_access: a } }), ctx)).json();
    expect(mine.items).toHaveLength(1);
    const theirs = await (await listReservations(req("/api/reservations", { cookies: { fm_access: b } }), ctx)).json();
    expect(theirs.items).toHaveLength(0);
    expect((await getReservation(req(`/api/reservations/${r.code}`, { cookies: { fm_access: b } }), { params: { id: r.code } })).status).toBe(404);

    expect((await setStatus(a, r.id, "PAGO")).status).toBe(403);
    expect((await setStatus(a, r.id, "CANCELADO")).status).toBe(200);
  });

  it("equipe conduz a locação; atraso vira ATRASADO e cobra multa por dia", async () => {
    const a = await cliente("a@teste.com");
    const r = (await (await reserve(a, order())).json()).reservation;
    const atendente = await staff(ATENDENTE);
    const dono = await staff(ADMIN);

    expect((await setStatus(atendente, r.id, "PAGO")).status).toBe(403);
    expect((await setStatus(dono, r.id, "PAGO")).status).toBe(200);
    expect((await setStatus(atendente, r.id, "DEVOLVIDO")).status).toBe(409);
    expect((await setStatus(atendente, r.id, "EM_LOCACAO")).status).toBe(200);

    // Simula que a devolução era há 5 dias.
    const past = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);
    await prisma.reservation.update({
      where: { id: r.id },
      data: { eventDate: new Date(`${past}T00:00:00Z`), returnDate: new Date(`${past}T00:00:00Z`) },
    });
    const list = await (await listReservations(req("/api/reservations?status=ATRASADO", { cookies: { fm_access: atendente } }), ctx)).json();
    expect(list.items.map((x: { id: string }) => x.id)).toEqual([r.id]);

    const done = await (await setStatus(atendente, r.id, "DEVOLVIDO")).json();
    expect(done.reservation.lateFee).toBe(5 * 10000);
    expect(done.reservation.totalPrice).toBe(365000 + 50000);
  });

  it("equipe cria reserva manual para um cliente", async () => {
    await cliente("a@teste.com");
    const clientId = (await prisma.client.findFirstOrThrow()).id;
    const atendente = await staff(ATENDENTE);
    expect((await reserve(atendente, order())).status).toBe(400);
    const res = await reserve(atendente, order({ clientId }));
    expect(res.status).toBe(201);
  });
});
