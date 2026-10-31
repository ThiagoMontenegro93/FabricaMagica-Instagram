import { Prisma, prisma } from "@fabrica/db";
import {
  ClientSchema,
  documentVerificationMessage,
  formatCPF,
  type Role,
  whatsappLink,
} from "@fabrica/shared";
import { Errors } from "../errors";
import { audit } from "../audit";
import { documentStatus } from "./document.service";

/** Contrato vigente aceito no cadastro (versionar quando o texto mudar). */
export const CONTRACT_VERSION = "2026-10-v1";

/** LGPD: atendente vê CPF mascarado. */
export function maskCPF(cpf: string): string {
  const f = formatCPF(cpf);
  return f.length === 14 ? `***.${f.slice(4, 11)}-**` : "***";
}

/**
 * RF06 / RN01 / RN04 / RN05 / RN11.
 * - CLIENTE cria o próprio cadastro (vinculado ao login).
 * - ATENDENTE/SUPER_ADMIN cria cadastro manual (sem login vinculado).
 * O schema não aceita nenhum campo de arquivo: com hostSensitiveDocs = false
 * nada de documento chega ao banco. Uploads entram no Sprint 4, por rota própria.
 */
export async function createClient(
  tenantId: string,
  actor: { id: string; role: Role },
  input: unknown,
  ip?: string,
) {
  const data = ClientSchema.parse(input);
  const settings = await prisma.tenantSettings.findUniqueOrThrow({ where: { tenantId } });
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { whatsapp: true } });

  const selfService = actor.role === "CLIENTE";
  if (selfService) {
    const existing = await prisma.client.findUnique({ where: { userId: actor.id } });
    if (existing) throw Errors.conflict("Você já completou seu cadastro.");
  }

  const now = new Date();
  try {
    const client = await prisma.client.create({
      data: {
        tenantId,
        userId: selfService ? actor.id : null,
        name: data.name,
        cpf: data.cpf,
        rg: data.rg,
        birthDate: data.birthDate,
        email: data.email,
        whatsapp: data.whatsapp,
        phone2: data.phone2,
        address: data.address,
        partyAddress: data.partyAddressDifferent && data.partyAddress ? data.partyAddress : Prisma.JsonNull,
        lgpdConsent: data.lgpdConsent,
        lgpdConsentAt: now,
        contractAccepted: data.contractAccepted,
        contractVersion: CONTRACT_VERSION,
      },
      select: { id: true, name: true, createdAt: true },
    });
    await audit({ tenantId, action: "CREATE_CLIENT", actorId: actor.id, targetId: client.id, ip, metadata: { selfService } });

    return {
      client,
      documentVerification: settings.hostSensitiveDocs
        ? { mode: "UPLOAD" as const, requireProof: settings.requireProof, requireSelfie: settings.requireSelfie }
        : {
            mode: "WHATSAPP" as const,
            message: "Verificação via WhatsApp: nossa equipe vai te chamar.",
            link: whatsappLink(documentVerificationMessage(data.name), tenant.whatsapp),
          },
    };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw Errors.conflict("Já existe um cadastro com este CPF.");
    }
    throw err;
  }
}

export async function listClients(
  tenantId: string,
  actor: { id: string; role: Role },
  opts: { q?: string; take?: number; cursor?: string },
  ip?: string,
) {
  const take = Math.min(Math.max(opts.take ?? 20, 1), 100);
  const q = opts.q?.trim();
  const digits = q?.replace(/\D/g, "");
  const rows = await prisma.client.findMany({
    where: {
      tenantId,
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { email: { contains: q.toLowerCase() } },
              ...(digits && digits.length >= 3 ? [{ cpf: { contains: digits } }, { whatsapp: { contains: digits } }] : []),
            ],
          }
        : {}),
    },
    select: { id: true, name: true, cpf: true, email: true, whatsapp: true, birthDate: true, docsVerifiedAt: true, createdAt: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  await audit({ tenantId, action: "VIEW_CLIENTS", actorId: actor.id, targetId: tenantId, ip, metadata: { count: page.length } });

  return {
    items: page.map((c) => ({ ...c, cpf: actor.role === "SUPER_ADMIN" ? formatCPF(c.cpf) : maskCPF(c.cpf) })),
    nextCursor: hasMore ? page[page.length - 1]?.id : null,
  };
}

/** Cadastro do próprio cliente, para o checkout preencher endereço e contato. */
export async function getMyClient(tenantId: string, userId: string) {
  return prisma.client.findFirst({
    where: { tenantId, userId, deletedAt: null },
    select: { id: true, name: true, email: true, whatsapp: true, address: true, partyAddress: true, docsVerifiedAt: true },
  });
}

/** Ficha do cliente para a equipe: dados, documentos (sem conteúdo) e últimas reservas. */
export async function getClientDetail(tenantId: string, actor: { id: string; role: Role }, id: string, ip?: string) {
  const c = await prisma.client.findFirst({
    where: { id, tenantId, deletedAt: null },
    select: {
      id: true, name: true, cpf: true, rg: true, birthDate: true, email: true, whatsapp: true, phone2: true,
      address: true, partyAddress: true, docsVerifiedAt: true, contractVersion: true, lgpdConsentAt: true, createdAt: true,
      reservations: { select: { id: true, code: true, status: true, dealType: true, eventDate: true, totalPrice: true }, orderBy: { eventDate: "desc" }, take: 20 },
    },
  });
  if (!c) throw Errors.notFound("Cliente não encontrado");
  await audit({ tenantId, action: "VIEW_CLIENT", actorId: actor.id, targetId: c.id, ip });
  const docs = await documentStatus(tenantId, c.id);
  return {
    client: {
      ...c,
      cpf: actor.role === "SUPER_ADMIN" ? formatCPF(c.cpf) : maskCPF(c.cpf),
      rg: actor.role === "SUPER_ADMIN" ? c.rg : "***",
      reservations: c.reservations.map((r) => ({ ...r, eventDate: r.eventDate.toISOString().slice(0, 10) })),
    },
    documents: docs,
  };
}
