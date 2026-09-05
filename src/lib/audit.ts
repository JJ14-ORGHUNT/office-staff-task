import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

export async function logAudit(
  params: {
    userId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    detail?: string;
  },
  // Optional Prisma client/transaction handle -- pass a `tx` from inside a
  // `prisma.$transaction(async (tx) => ...)` callback so the audit-log write
  // commits atomically with whatever it's recording. Defaults to the shared
  // singleton for the (much more common) non-transactional call sites.
  client: PrismaClient | Prisma.TransactionClient = prisma,
) {
  await client.auditLog.create({
    data: {
      userId: params.userId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      detail: params.detail,
    },
  });
}
