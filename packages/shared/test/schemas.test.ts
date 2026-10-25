import { describe, expect, it } from "vitest";
import { ClientSchema, MIN_AGE_MESSAGE, ReservationRequestSchema, TenantSettingsPatchSchema, whatsappLink } from "../src";

const validClient = {
  name: "Morticia Addams",
  cpf: "529.982.247-25",
  rg: "12.345.678-9",
  birthDate: "1990-05-10",
  email: "Morticia@Exemplo.com ",
  whatsapp: "(21) 97284-8645",
  address: { cep: "20770-001", rua: "Av. Dom Helder Câmara", numero: "6001", bairro: "Engenho de Dentro", cidade: "Rio de Janeiro", estado: "rj" },
  lgpdConsent: true,
  contractAccepted: true,
};

describe("ClientSchema (RF06)", () => {
  it("normaliza CPF, telefone, e-mail, CEP e UF", () => {
    const c = ClientSchema.parse(validClient);
    expect(c.cpf).toBe("52998224725");
    expect(c.whatsapp).toBe("21972848645");
    expect(c.email).toBe("morticia@exemplo.com");
    expect(c.address.cep).toBe("20770001");
    expect(c.address.estado).toBe("RJ");
  });
  it("bloqueia menor de 18 com a mensagem oficial", () => {
    const r = ClientSchema.safeParse({ ...validClient, birthDate: new Date().toISOString().slice(0, 10) });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.message)).toContain(MIN_AGE_MESSAGE);
  });
  it("RN11: exige LGPD e contrato", () => {
    expect(ClientSchema.safeParse({ ...validClient, lgpdConsent: false }).success).toBe(false);
    expect(ClientSchema.safeParse({ ...validClient, contractAccepted: false }).success).toBe(false);
  });
  it("exige endereço da festa quando marcado como diferente", () => {
    expect(ClientSchema.safeParse({ ...validClient, partyAddressDifferent: true }).success).toBe(false);
  });
  it("rejeita CPF inválido", () => {
    expect(ClientSchema.safeParse({ ...validClient, cpf: "111.111.111-11" }).success).toBe(false);
  });
});

describe("ReservationRequestSchema", () => {
  it("valida período, itens e endereço de entrega", () => {
    expect(ReservationRequestSchema.safeParse({ eventDate: "2026-10-31", returnDate: "2026-10-30", deliveryType: "RETIRADA", themes: [{ themeId: "t1" }] }).success).toBe(false);
    expect(ReservationRequestSchema.safeParse({ eventDate: "2026-10-31", returnDate: "2026-11-01", deliveryType: "RETIRADA" }).success).toBe(false);
    expect(ReservationRequestSchema.safeParse({ eventDate: "2026-10-31", returnDate: "2026-11-01", deliveryType: "ENTREGA", themes: [{ themeId: "t1" }] }).success).toBe(false);
    expect(ReservationRequestSchema.safeParse({ eventDate: "2026-02-30", returnDate: "2026-03-01", deliveryType: "RETIRADA", themes: [{ themeId: "t1" }] }).success).toBe(false);
    expect(ReservationRequestSchema.safeParse({ eventDate: "2026-10-31", returnDate: "2026-11-01", deliveryType: "RETIRADA", themes: [{ themeId: "t1" }] }).success).toBe(true);
  });
});

describe("TenantSettings (RF12)", () => {
  it("só aceita retenção 30/90/365", () => {
    expect(TenantSettingsPatchSchema.safeParse({ retentionDays: 90 }).success).toBe(true);
    expect(TenantSettingsPatchSchema.safeParse({ retentionDays: 45 }).success).toBe(false);
  });
});

describe("WhatsApp (RF13)", () => {
  it("gera link wa.me oficial com mensagem codificada", () => {
    expect(whatsappLink()).toBe("https://wa.me/5521972848645");
    expect(whatsappLink("Olá & tchau")).toBe("https://wa.me/5521972848645?text=Ol%C3%A1%20%26%20tchau");
  });
});
