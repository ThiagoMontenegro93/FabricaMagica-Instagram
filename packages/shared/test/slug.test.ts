import { describe, expect, it } from "vitest";
import { PartyThemeSchema, slugify } from "../src";

describe("slugify", () => {
  it("remove acentos e símbolos", () => {
    expect(slugify("A Bela e a Fera")).toBe("a-bela-e-a-fera");
    expect(slugify("O Rei Leão")).toBe("o-rei-leao");
    expect(slugify("  Halloween!! Premium  ")).toBe("halloween-premium");
  });
});

describe("PartyThemeSchema", () => {
  const base = { name: "Harry Potter", category: "Personagens e Filmes", description: "Salão comunal com velas flutuantes", dailyPrice: 50000 };
  it("aceita categoria nova (catálogo sem limite fixo)", () => {
    expect(PartyThemeSchema.safeParse({ ...base, category: "Festa Junina" }).success).toBe(true);
  });
  it("só aceita fotos https e preço em centavos inteiros", () => {
    expect(PartyThemeSchema.safeParse({ ...base, photos: ["http://x.com/a.jpg"] }).success).toBe(false);
    expect(PartyThemeSchema.safeParse({ ...base, dailyPrice: 500.5 }).success).toBe(false);
  });
});
