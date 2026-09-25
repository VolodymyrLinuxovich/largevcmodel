import "server-only";

import { AuditActorType, Prisma, PrismaClient } from "@prisma/client";

export async function audit(
  prisma: PrismaClient,
  input: {
    userId?: string | null;
    actorType?: AuditActorType | keyof typeof AuditActorType;
    actor: string;
    action: string;
    outcome: string;
    affectedContactId?: string | null;
    dataSource?: string | null;
    details?: string | null;
    metadata?: Record<string, unknown>;
    scoreDelta?: string | null;
    researchRunId?: string | null;
  },
) {
  try {
    const actorType =
      typeof input.actorType === "string" ? AuditActorType[input.actorType] : (input.actorType ?? AuditActorType.SYSTEM);
    await prisma.auditEvent.create({
      data: {
        userId: input.userId ?? null,
        actorType,
        actor: input.actor,
        action: input.action,
        outcome: input.outcome,
        affectedContactId: input.affectedContactId ?? null,
        dataSource: input.dataSource ?? null,
        details: input.details ?? null,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
        scoreDelta: input.scoreDelta ?? null,
        researchRunId: input.researchRunId ?? null,
      },
    });
  } catch (error) {
    // Audit writes must not block user-facing actions, but failures are reported (without the
    // event payload, which may contain private provider data).
    console.error("Audit event could not be recorded", {
      action: input.action,
      error: error instanceof Error ? error.message : "Unknown audit failure",
    });
  }
}
