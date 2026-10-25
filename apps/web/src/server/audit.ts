import { prisma, type Prisma } from "@fabrica/db";
import { log } from "./logger";

export type AuditAction =
  | "LOGIN"
  | "LOGIN_FAILED"
  | "REGISTER"
  | "REFRESH_REUSE_DETECTED"
  | "UPDATE_SETTINGS"
  | "CREATE_CLIENT"
  | "VIEW_CLIENTS"
  | "ACCESS_DOC";

/** Grava no AuditLog e também no log JSON (RF12, LGPD). */
export async function audit(input: {
  tenantId: string;
  action: AuditAction;
  actorId: string;
  targetId: string;
  ip?: string;
  metadata?: Prisma.InputJsonValue;
}) {
  await prisma.auditLog.create({ data: input });
  log("info", { action: input.action, tenantId: input.tenantId, userId: input.actorId, target: input.targetId });
}
