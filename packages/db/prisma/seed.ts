/**
 * Seed idempotente: cria o tenant da Fábrica Mágica, as configurações padrão,
 * um catálogo inicial de temas e personagens vivos. Preços são EXEMPLOS
 * e devem ser ajustados pelo dono no painel admin.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const branding = {
  slogan: "Alugue o Medo. Celebre o Luxo.",
  instagram: "@afabricamagica",
  address: "Av. Dom Helder Câmara, 6001 - Engenho de Dentro, Rio de Janeiro - RJ",
  colors: {
    background: "#050505",
    card: "#151515",
    purpleNeon: "#9D00FF",
    gold: "#D4AF37",
    yellow: "#FFD700",
    pink: "#FF00A8",
    greenNeon: "#00FF88",
  },
  logoUrl: null,
};

const themes = [
  {
    slug: "mansao-dracula-nocturne",
    name: "Mansão Drácula Nocturne",
    category: "Halloween Premium",
    description: "Cenário gótico com candelabros, veludo vinho e caixão cenográfico para uma noite de luxo sombrio.",
    includedItems: ["Painel gótico 3x2m", "Mesa imperial", "2 candelabros", "Caixão cenográfico", "Tapete vinho"],
    sizeM2: 12,
    dailyPrice: 85000,
    totalQty: 2,
    isBestseller: true,
  },
  {
    slug: "bruxaria-de-luxo",
    name: "Bruxaria de Luxo",
    category: "Halloween Premium",
    description: "Caldeirões, grimórios e névoa roxa: o ateliê de uma bruxa elegante em detalhes dourados.",
    includedItems: ["Painel redondo", "Caldeirão LED", "Grimórios", "Arco de balões roxo e preto"],
    sizeM2: 9,
    dailyPrice: 65000,
    totalQty: 2,
    isNew: true,
  },
  {
    slug: "arco-baloes-neon",
    name: "Arco de Balões Neon",
    category: "Balões",
    description: "Arco orgânico em balões preto, roxo e laranja com toque neon para qualquer festa sombria.",
    includedItems: ["Arco orgânico 3m", "Balões metalizados", "Estrutura"],
    sizeM2: 4,
    dailyPrice: 32000,
    totalQty: 4,
  },
];

const characters = [
  { slug: "dracula-classico", name: "Drácula Clássico", pricePer2h: 45000, priceExtraHour: 18000 },
  { slug: "bruxa-elegante-luxo", name: "Bruxa Elegante Luxo", pricePer2h: 45000, priceExtraHour: 18000 },
  { slug: "mickey-fantasia-halloween", name: "Mickey Fantasia Halloween", pricePer2h: 40000, priceExtraHour: 15000 },
  { slug: "coringa-sombrio", name: "Coringa Sombrio", pricePer2h: 45000, priceExtraHour: 18000 },
];

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "afabricamagica" },
    update: { branding },
    create: { name: "A Fábrica Mágica", slug: "afabricamagica", whatsapp: "5521972848645", branding },
  });

  await prisma.tenantSettings.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: { tenantId: tenant.id }, // hostSensitiveDocs = false por padrão (modo econômico LGPD)
  });

  for (const t of themes) {
    await prisma.partyTheme.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: t.slug } },
      update: {},
      create: { ...t, tenantId: tenant.id, photos: [] },
    });
  }

  for (const c of characters) {
    await prisma.liveCharacter.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: c.slug } },
      update: {},
      create: { ...c, tenantId: tenant.id, photos: [] },
    });
  }

  console.log(JSON.stringify({ level: "info", action: "SEED_DONE", tenantId: tenant.id, themes: themes.length, characters: characters.length }));
}

main()
  .catch((err) => {
    console.error(JSON.stringify({ level: "error", action: "SEED_FAILED", message: String(err) }));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
