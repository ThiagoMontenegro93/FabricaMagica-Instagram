import { describe, expect, it } from "vitest";
import { calculateAge, isAdult } from "../src";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("RN01 - idade mínima 18", () => {
  const today = d("2026-10-25");
  it("faz 18 hoje: permitido", () => {
    expect(calculateAge(d("2008-10-25"), today)).toBe(18);
    expect(isAdult(d("2008-10-25"), today)).toBe(true);
  });
  it("faz 18 amanhã: bloqueado", () => {
    expect(calculateAge(d("2008-10-26"), today)).toBe(17);
    expect(isAdult(d("2008-10-26"), today)).toBe(false);
  });
  it("adulto comum", () => {
    expect(isAdult(d("1990-01-01"), today)).toBe(true);
  });
});
