import { describe, expect, it } from "vitest";
import { PartyThemeSchema, TenantSettingsPatchSchema, calculateQuote, resolveOffer } from "../src";

const loja = { defaultOfferMode: "ALUGUEL" as const, allowPickup: true, allowDelivery: true, deliveryFeeBase: 40000 };

describe("resolveOffer", () => {
  it("tema sem configuração segue o padrão da loja", () => {
    const o = resolveOffer({}, loja);
    expect(o.deals).toEqual(["ALUGUEL"]);
    expect(o.deliveryTypes).toEqual(["RETIRADA", "ENTREGA"]);
    expect(o.deliveryFee).toBe(40000);
  });

  it("aluguel e venda quando o tema tem preço de venda", () => {
    const o = resolveOffer({ offerMode: "AMBOS", salePrice: 900000, saleQty: 2 }, loja);
    expect(o.deals).toEqual(["ALUGUEL", "VENDA"]);
    expect(o.saleQty).toBe(2);
  });

  it("venda some se não há preço de venda", () => {
    expect(resolveOffer({ offerMode: "VENDA" }, loja).deals).toEqual([]);
  });

  it("tema sobrescreve as formas de entrega e o frete", () => {
    const o = resolveOffer({ allowPickup: false, deliveryFee: 25000 }, loja);
    expect(o.deliveryTypes).toEqual(["ENTREGA"]);
    expect(o.deliveryFee).toBe(25000);
  });

  it("loja só com retirada", () => {
    expect(resolveOffer({}, { ...loja, allowDelivery: false }).deliveryTypes).toEqual(["RETIRADA"]);
  });
});

describe("calculateQuote por negócio e entrega", () => {
  const sabado = "2026-10-31";
  const tema = { dailyPrice: 250000, quantity: 1, salePrice: 900000 };

  it("aluguel com entrega: diária + taxa fds + frete", () => {
    const q = calculateQuote({ eventDate: sabado, themes: [tema], characters: [], deliveryFee: 40000, tenantWeekendMultiplier: 1.3, deliveryType: "ENTREGA" });
    expect(q.weekendFee).toBe(75000);
    expect(q.total).toBe(250000 + 75000 + 40000);
  });

  it("aluguel com retirada: sem frete", () => {
    const q = calculateQuote({ eventDate: sabado, themes: [tema], characters: [], deliveryFee: 40000, tenantWeekendMultiplier: 1.3, deliveryType: "RETIRADA" });
    expect(q.deliveryFee).toBe(0);
    expect(q.total).toBe(325000);
  });

  it("venda: preço de venda, sem taxa fds, frete só na entrega", () => {
    const base = { eventDate: sabado, themes: [tema], characters: [], deliveryFee: 40000, tenantWeekendMultiplier: 1.3, dealType: "VENDA" as const };
    expect(calculateQuote({ ...base, deliveryType: "ENTREGA" }).total).toBe(940000);
    const retirada = calculateQuote({ ...base, deliveryType: "RETIRADA" });
    expect(retirada.weekendFee).toBe(0);
    expect(retirada.total).toBe(900000);
  });

  it("venda sem preço de venda é erro", () => {
    expect(() =>
      calculateQuote({ eventDate: sabado, themes: [{ dailyPrice: 1, quantity: 1 }], characters: [], deliveryFee: 0, tenantWeekendMultiplier: 1, dealType: "VENDA" }),
    ).toThrow();
  });
});

describe("validação de oferta", () => {
  const base = { name: "Halloween", category: "Halloween Premium", description: "Tema completo de Halloween", dailyPrice: 250000 };
  it("vender exige preço de venda", () => {
    expect(PartyThemeSchema.safeParse({ ...base, offerMode: "AMBOS" }).success).toBe(false);
    expect(PartyThemeSchema.safeParse({ ...base, offerMode: "AMBOS", salePrice: 900000 }).success).toBe(true);
  });
  it("tema e loja precisam de ao menos uma forma de entrega", () => {
    expect(PartyThemeSchema.safeParse({ ...base, allowPickup: false, allowDelivery: false }).success).toBe(false);
    expect(TenantSettingsPatchSchema.safeParse({ allowPickup: false, allowDelivery: false }).success).toBe(false);
    expect(TenantSettingsPatchSchema.safeParse({ allowPickup: false }).success).toBe(true);
  });
});
