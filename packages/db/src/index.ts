import { PrismaClient } from "@prisma/client";

export * from "@prisma/client";

// Reaproveita a conexão em hot reload (Next.js dev) para não estourar o pool.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
