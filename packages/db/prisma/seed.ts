/**
 * Seed idempotente: cria o tenant da Fábrica Mágica, as configurações padrão,
 * um catálogo inicial de temas e personagens vivos. Preços são EXEMPLOS
 * e devem ser ajustados pelo dono no painel admin.
 */
import bcrypt from "bcryptjs";
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

/**
 * Temas iniciais pedidos pelo Thiago (destaques do Instagram).
 * O catálogo não tem limite: novos temas são cadastrados pelo dono em /admin/temas.
 * PREÇOS E ITENS SÃO EXEMPLOS: ajustar no painel antes de abrir as reservas.
 */
const themes = [
  {
    slug: "o-rei-leao",
    name: "O Rei Leão",
    category: "Personagens e Filmes",
    description: "A savana africana na sua festa: Pedra do Reino, folhagens tropicais e os personagens que todo mundo ama.",
    includedItems: ["Painel Pedra do Reino", "Mesa principal", "Folhagens tropicais", "Bonecos decorativos"],
    dailyPrice: 60000,
    totalQty: 1,
    isBestseller: true,
  },
  {
    slug: "harry-potter",
    name: "Harry Potter",
    category: "Personagens e Filmes",
    description: "Um salão de Hogwarts com velas, brasões das casas e magia em cada detalhe.",
    includedItems: ["Painel Hogwarts", "Mesa com brasões das quatro casas", "Velas cenográficas", "Elfo decorativo"],
    dailyPrice: 70000,
    totalQty: 1,
  },
  {
    slug: "mickey-mouse",
    name: "Mickey Mouse",
    category: "Personagens e Filmes",
    description: "O clássico Mickey feiticeiro com chapéu de estrelas, cores vibrantes e muita alegria.",
    includedItems: ["Painel Mickey", "Mesa principal", "Arco de balões vermelho, preto e amarelo", "Boneco decorativo"],
    dailyPrice: 55000,
    totalQty: 1,
  },
  {
    slug: "mundo-disney",
    name: "Mundo Disney",
    category: "Personagens e Filmes",
    description: "Castelo, fogos e personagens Disney para uma festa encantada do começo ao fim.",
    includedItems: ["Painel castelo", "Mesa principal", "Iluminação colorida", "Personagens decorativos"],
    dailyPrice: 65000,
    totalQty: 1,
    isNew: true,
  },
  {
    slug: "halloween",
    name: "Halloween",
    category: "Halloween Premium",
    description: "Fantasmas, abóboras e névoa: o Halloween de luxo que é a marca registrada da Fábrica Mágica.",
    includedItems: ["Painel gótico", "Fantasma gigante", "Abóboras iluminadas", "Mesa principal"],
    dailyPrice: 85000,
    totalQty: 1,
    isBestseller: true,
  },
  {
    slug: "a-bela-e-a-fera",
    name: "A Bela e a Fera",
    category: "Personagens e Filmes",
    description: "O castelo encantado da Fera com rosa sob a redoma, candelabros e detalhes em azul e dourado.",
    includedItems: ["Painel salão de baile", "Mesa imperial", "Rosa encantada com redoma", "Candelabros"],
    dailyPrice: 70000,
    totalQty: 1,
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

  // Dono (SUPER_ADMIN): criado só se ADMIN_EMAIL e ADMIN_PASSWORD estiverem no ambiente.
  // A senha nunca é sobrescrita em execuções seguintes.
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    if (adminPassword.length < 12) throw new Error("ADMIN_PASSWORD precisa de ao menos 12 caracteres");
    await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: adminEmail } },
      update: { role: "SUPER_ADMIN", active: true },
      create: { tenantId: tenant.id, email: adminEmail, passwordHash: await bcrypt.hash(adminPassword, 12), role: "SUPER_ADMIN" },
    });
  }

  console.log(JSON.stringify({ level: "info", action: "SEED_DONE", admin: Boolean(adminEmail && adminPassword), tenantId: tenant.id, themes: themes.length, characters: characters.length }));
}

main()
  .catch((err) => {
    console.error(JSON.stringify({ level: "error", action: "SEED_FAILED", message: String(err) }));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
