import { describe, expect, it } from "vitest";
import { availableThemeQty, canReserveTheme, canTransition, isCharacterAvailable, isLate } from "../src";

const now = new Date("2026-10-25T12:00:00Z");

describe("RN02 - sem overbooking de tema", () => {
  const period = { eventDate: "2026-10-31", returnDate: "2026-11-01" };

  it("conta reservas pagas, em locação e atrasadas que se sobrepõem", () => {
    const res = [
      { status: "PAGO" as const, eventDate: "2026-10-31", returnDate: "2026-11-01", quantity: 1 },
      { status: "EM_LOCACAO" as const, eventDate: "2026-10-29", returnDate: "2026-10-31", quantity: 1 },
      { status: "DEVOLVIDO" as const, eventDate: "2026-10-31", returnDate: "2026-11-01", quantity: 1 },
      { status: "CANCELADO" as const, eventDate: "2026-10-31", returnDate: "2026-11-01", quantity: 1 },
      { status: "PAGO" as const, eventDate: "2026-11-05", returnDate: "2026-11-06", quantity: 1 },
    ];
    expect(availableThemeQty(3, res, period, now)).toBe(1);
    expect(canReserveTheme(3, res, period, 1, now)).toBe(true);
    expect(canReserveTheme(3, res, period, 2, now)).toBe(false);
  });

  it("PENDENTE só segura estoque enquanto o hold é válido", () => {
    const valid = { status: "PENDENTE" as const, eventDate: "2026-10-31", returnDate: "2026-10-31", quantity: 1, holdExpiresAt: new Date("2026-10-25T12:10:00Z") };
    const expired = { ...valid, holdExpiresAt: new Date("2026-10-25T11:59:00Z") };
    expect(availableThemeQty(1, [valid], period, now)).toBe(0);
    expect(availableThemeQty(1, [expired], period, now)).toBe(1);
  });

  it("nunca retorna negativo", () => {
    const res = [{ status: "PAGO" as const, eventDate: "2026-10-31", returnDate: "2026-10-31", quantity: 5 }];
    expect(availableThemeQty(1, res, period, now)).toBe(0);
  });
});

describe("RN03 - personagem não pode estar em 2 festas", () => {
  const existing = [{ startsAt: new Date("2026-10-31T18:00:00Z"), durationMinutes: 120 }];
  it("bloqueia sobreposição", () => {
    expect(isCharacterAvailable(existing, { startsAt: new Date("2026-10-31T19:00:00Z"), durationMinutes: 120 })).toBe(false);
    expect(isCharacterAvailable(existing, { startsAt: new Date("2026-10-31T17:00:00Z"), durationMinutes: 90 })).toBe(false);
  });
  it("permite horário encostado (termina 20h, próxima começa 20h)", () => {
    expect(isCharacterAvailable(existing, { startsAt: new Date("2026-10-31T20:00:00Z"), durationMinutes: 120 })).toBe(true);
  });
});

describe("RN08 - atraso", () => {
  const returnDate = new Date("2026-11-01T12:00:00Z");
  it("só fica atrasado depois de 24h", () => {
    expect(isLate("EM_LOCACAO", returnDate, new Date("2026-11-02T11:59:00Z"))).toBe(false);
    expect(isLate("EM_LOCACAO", returnDate, new Date("2026-11-02T12:01:00Z"))).toBe(true);
    expect(isLate("DEVOLVIDO", returnDate, new Date("2026-11-10T00:00:00Z"))).toBe(false);
  });
});

describe("Máquina de estados da reserva", () => {
  it("permite o fluxo feliz e bloqueia atalhos", () => {
    expect(canTransition("PENDENTE", "PAGO")).toBe(true);
    expect(canTransition("PAGO", "EM_LOCACAO")).toBe(true);
    expect(canTransition("EM_LOCACAO", "DEVOLVIDO")).toBe(true);
    expect(canTransition("PENDENTE", "EM_LOCACAO")).toBe(false);
    expect(canTransition("DEVOLVIDO", "PAGO")).toBe(false);
  });
});
