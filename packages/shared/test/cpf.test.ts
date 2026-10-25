import { describe, expect, it } from "vitest";
import { formatCPF, isValidCPF } from "../src";

describe("RN04 - CPF", () => {
  it("aceita CPFs válidos com e sem máscara", () => {
    expect(isValidCPF("529.982.247-25")).toBe(true);
    expect(isValidCPF("52998224725")).toBe(true);
    expect(isValidCPF("111.444.777-35")).toBe(true);
  });
  it("rejeita dígito verificador errado, tamanho errado e sequências repetidas", () => {
    expect(isValidCPF("529.982.247-24")).toBe(false);
    expect(isValidCPF("1234567890")).toBe(false);
    expect(isValidCPF("111.111.111-11")).toBe(false);
    expect(isValidCPF("")).toBe(false);
  });
  it("formata", () => {
    expect(formatCPF("52998224725")).toBe("529.982.247-25");
  });
});
