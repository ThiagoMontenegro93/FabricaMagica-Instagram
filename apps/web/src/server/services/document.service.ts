import { randomBytes } from "node:crypto";
import { Prisma, prisma } from "@fabrica/db";
import {
  DOCUMENT_KINDS,
  DOCUMENT_LINK_MINUTES,
  MAX_DOCUMENT_BYTES,
  addMinutes,
  requiredDocuments,
  sniffDocument,
  type DocumentKind,
  type Role,
} from "@fabrica/shared";
import { AppError, Errors } from "../errors";
import { audit } from "../audit";
import { decrypt, docsEncryptionReady, encrypt, sha256, signDocLink, verifyDocLink } from "../crypto-docs";
import { docStorage } from "../doc-storage";

type Actor = { id: string; role: Role };
const isStaff = (role: Role) => role === "SUPER_ADMIN" || role === "ATENDENTE";

const DOC_FIELDS = { id: true, kind: true, mimeType: true, sizeBytes: true, retainUntil: true, createdAt: true } as const;

async function settingsOf(tenantId: string) {
  return prisma.tenantSettings.findUniqueOrThrow({
    where: { tenantId },
    select: { hostSensitiveDocs: true, retentionDays: true, requireProof: true, requireSelfie: true, blockWithoutDocs: true },
  });
}

/** O que o cliente precisa enviar e o que já enviou. */
export async function documentStatus(tenantId: string, clientId: string) {
  const [settings, docs, client] = await Promise.all([
    settingsOf(tenantId),
    prisma.clientDocument.findMany({ where: { clientId, deletedAt: null }, select: DOC_FIELDS, orderBy: { createdAt: "asc" } }),
    prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { docsVerifiedAt: true } }),
  ]);
  const required = settings.hostSensitiveDocs ? requiredDocuments(settings) : [];
  const sent = new Set(docs.map((d) => d.kind));
  return {
    mode: settings.hostSensitiveDocs ? ("UPLOAD" as const) : ("WHATSAPP" as const),
    required,
    missing: required.filter((k) => !sent.has(k)),
    verifiedAt: client.docsVerifiedAt,
    retentionDays: settings.retentionDays,
    documents: docs,
  };
}

async function ownClient(tenantId: string, userId: string) {
  const c = await prisma.client.findFirst({ where: { tenantId, userId, deletedAt: null }, select: { id: true } });
  if (!c) throw Errors.conflict("Complete seu cadastro de locação antes de enviar documentos.");
  return c;
}

export async function myDocumentStatus(tenantId: string, userId: string) {
  return documentStatus(tenantId, (await ownClient(tenantId, userId)).id);
}

/**
 * RF07 / RN06 / RN12: só com hostSensitiveDocs ligado.
 * Conteúdo conferido pelos bytes, criptografado antes de sair da memória, com prazo de retenção.
 * Reenviar o mesmo tipo substitui o anterior.
 */
export async function uploadDocument(tenantId: string, actor: Actor, form: FormData, ip?: string) {
  const settings = await settingsOf(tenantId);
  if (!settings.hostSensitiveDocs) {
    throw Errors.forbidden("A loja não guarda documentos. A verificação é feita pelo WhatsApp.");
  }
  if (!docsEncryptionReady()) throw new AppError(503, "DOCS_DISABLED", "Envio de documentos indisponível no momento. Fale com a loja.");

  const client = await ownClient(tenantId, actor.id);
  const kind = String(form.get("kind") ?? "") as DocumentKind;
  if (!(DOCUMENT_KINDS as readonly string[]).includes(kind)) throw Errors.badRequest("Tipo de documento inválido");
  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) throw Errors.badRequest("Escolha um arquivo");
  if (file.size > MAX_DOCUMENT_BYTES) throw Errors.badRequest("Arquivo maior que 5 MB");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffDocument(bytes);
  if (!mime) throw Errors.badRequest("Envie uma foto (JPG ou PNG) ou um PDF");

  const hash = sha256(bytes);
  const { body, iv, authTag } = encrypt(bytes);
  const key = `docs/${tenantId}/${client.id}/${randomBytes(16).toString("hex")}.bin`;
  await docStorage().put(key, body);

  const previous = await prisma.clientDocument.findMany({ where: { clientId: client.id, kind, deletedAt: null }, select: { id: true, storageKey: true } });
  let doc;
  try {
    doc = await prisma.$transaction(async (tx) => {
      await tx.clientDocument.deleteMany({ where: { id: { in: previous.map((p) => p.id) } } });
      return tx.clientDocument.create({
        data: {
          clientId: client.id,
          kind,
          storageKey: key,
          sha256: hash,
          mimeType: mime,
          sizeBytes: bytes.length,
          iv,
          authTag,
          retainUntil: addMinutes(new Date(), settings.retentionDays * 24 * 60),
        },
        select: DOC_FIELDS,
      });
    });
  } catch (err) {
    await docStorage().delete(key);
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw Errors.conflict("Este arquivo já foi enviado em outro campo.");
    }
    throw err;
  }
  for (const p of previous) await docStorage().delete(p.storageKey).catch(() => undefined);
  // Documento novo exige nova conferência da equipe.
  await prisma.client.update({ where: { id: client.id }, data: { docsVerifiedAt: null } });
  await audit({ tenantId, action: "DOC_UPLOAD", actorId: actor.id, targetId: doc.id, ip, metadata: { kind, sizeBytes: bytes.length } });
  return doc;
}

/** LGPD: o cliente pode apagar o próprio documento a qualquer momento. */
export async function deleteMyDocument(tenantId: string, actor: Actor, id: string, ip?: string) {
  const client = await ownClient(tenantId, actor.id);
  const doc = await prisma.clientDocument.findFirst({ where: { id, clientId: client.id }, select: { id: true, storageKey: true } });
  if (!doc) throw Errors.notFound("Documento não encontrado");
  await prisma.clientDocument.delete({ where: { id: doc.id } });
  await docStorage().delete(doc.storageKey).catch(() => undefined);
  await prisma.client.update({ where: { id: client.id }, data: { docsVerifiedAt: null } });
  await audit({ tenantId, action: "DOC_DELETE", actorId: actor.id, targetId: doc.id, ip });
}

/** RF12: equipe gera link de 15 minutos; cada geração entra no AuditLog. */
export async function documentLink(tenantId: string, actor: Actor, id: string, ip?: string) {
  if (!isStaff(actor.role)) throw Errors.forbidden();
  const doc = await prisma.clientDocument.findFirst({ where: { id, deletedAt: null, client: { tenantId } }, select: { id: true, kind: true, clientId: true } });
  if (!doc) throw Errors.notFound("Documento não encontrado");
  const expiresAt = addMinutes(new Date(), DOCUMENT_LINK_MINUTES);
  await audit({ tenantId, action: "ACCESS_DOC", actorId: actor.id, targetId: doc.id, ip, metadata: { kind: doc.kind, clientId: doc.clientId } });
  return { url: `/api/documents/${doc.id}/file?t=${signDocLink(doc.id, expiresAt)}`, expiresAt };
}

/** Abre o arquivo: exige link válido E sessão da equipe. */
export async function readDocument(tenantId: string, actor: Actor, id: string, token: string | null) {
  if (!isStaff(actor.role)) throw Errors.forbidden();
  verifyDocLink(id, token);
  const doc = await prisma.clientDocument.findFirst({ where: { id, deletedAt: null, client: { tenantId } } });
  if (!doc) throw Errors.notFound("Documento não encontrado");
  const plain = decrypt(await docStorage().get(doc.storageKey), doc.iv, doc.authTag);
  if (sha256(plain) !== doc.sha256) throw new AppError(500, "INTEGRITY", "Arquivo corrompido");
  return { body: plain, mimeType: doc.mimeType };
}

/** Equipe confere os documentos (upload ou WhatsApp) e libera o cliente. */
export async function setDocsVerified(tenantId: string, actor: Actor, clientId: string, verified: boolean, ip?: string) {
  if (!isStaff(actor.role)) throw Errors.forbidden();
  const c = await prisma.client.findFirst({ where: { id: clientId, tenantId, deletedAt: null }, select: { id: true } });
  if (!c) throw Errors.notFound("Cliente não encontrado");
  const updated = await prisma.client.update({
    where: { id: c.id },
    data: { docsVerifiedAt: verified ? new Date() : null },
    select: { docsVerifiedAt: true },
  });
  await audit({ tenantId, action: "DOCS_VERIFIED", actorId: actor.id, targetId: c.id, ip, metadata: { verified } });
  return updated;
}

/** Retenção (30/90/365 dias): apaga arquivo e registro vencidos. Rodar por cron diário. */
export async function purgeExpiredDocuments(now = new Date()) {
  const expired = await prisma.clientDocument.findMany({
    where: { retainUntil: { lt: now } },
    select: { id: true, storageKey: true, client: { select: { tenantId: true } } },
    take: 500,
  });
  for (const d of expired) {
    await docStorage().delete(d.storageKey).catch(() => undefined);
    await prisma.clientDocument.delete({ where: { id: d.id } });
    await audit({ tenantId: d.client.tenantId, action: "DOC_PURGE", actorId: "system", targetId: d.id });
  }
  return expired.length;
}

/** Reserva bloqueada quando a loja exige documentos e o cliente não enviou os obrigatórios. */
export async function assertDocsForReservation(tenantId: string, clientId: string) {
  const settings = await settingsOf(tenantId);
  if (!settings.hostSensitiveDocs || !settings.blockWithoutDocs) return;
  const status = await documentStatus(tenantId, clientId);
  if (status.verifiedAt) return;
  if (status.missing.length > 0) {
    throw new AppError(409, "DOCS_REQUIRED", "Envie seus documentos antes de reservar.");
  }
}
