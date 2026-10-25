import { describe, expect, it } from "vitest";
import { calculateQuote, characterDurationMinutes, formatBRL, isWeekendRate } from "../src";

describe("RN07 / RF04 - preço e taxa de fim de semana", () => {
  it("identifica sexta e sábado", () => {
    expect(isWeekendRate("2026-10-30")).toBe(true); // sexta
    expect(isWeekendRate("2026-10-31")).toBe(true); // sábado (Halloween)
    expect(isWeekendRate("2026-11-01")).toBe(false); // domingo
    expect(isWeekendRate("2026-10-28")).toBe(false); // quarta
  });

  it("dia útil: sem taxa fds", () => {
    const q = calculateQuote({
      eventDate: "2026-10-28",
      themes: [{ dailyPrice: 85000, quantity: 1 }],
      characters: [{ pricePer2h: 40000, priceExtraHour: 15000, extraHours: 1 }],
      deliveryFee: 8000,
      tenantWeekendMultiplier: 1.3,
    });
    expect(q).toMatchObject({ subtotal: 140000, weekendFee: 0, total: 148000, isWeekend: false });
  });

  it("sábado: +30% só sobre temas, multiplicador do tema tem prioridade", () => {
    const q = calculateQuote({
      eventDate: "2026-10-31",
      themes: [
        { dailyPrice: 85000, quantity: 1 }, // usa 1.3 do tenant -> 25500
        { dailyPrice: 10000, quantity: 2, weekendMultiplier: 1.5 }, // 20000 * 0.5 -> 10000
      ],
      characters: [{ pricePer2h: 40000, priceExtraHour: 15000, extraHours: 0 }],
      deliveryFee: 0,
      tenantWeekendMultiplier: 1.3,
    });
    expect(q.themesSubtotal).toBe(105000);
    expect(q.charactersSubtotal).toBe(40000);
    expect(q.weekendFee).toBe(35500);
    expect(q.total).toBe(180500);
  });

  it("rejeita valores não inteiros (centavos)", () => {
    expect(() =>
      calculateQuote({ eventDate: "2026-10-28", themes: [{ dailyPrice: 10.5, quantity: 1 }], characters: [], deliveryFee: 0, tenantWeekendMultiplier: 1.3 }),
    ).toThrow();
  });

  it("duração do personagem e formatação BRL", () => {
    expect(characterDurationMinutes(0)).toBe(120);
    expect(characterDurationMinutes(2)).toBe(240);
    expect(formatBRL(85000).replace(/\s/g, " ")).toBe("R$ 850,00");
  });
});
