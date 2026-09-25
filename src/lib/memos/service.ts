import "server-only";

import { OpportunityEventType, Prisma, type PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/api/errors";
import { audit } from "@/lib/audit";
import { loadOpportunityEvidence } from "@/lib/evidence/loader";
import type { Actor } from "@/lib/pipeline/service";
import { assembleInvestmentMemo, IC_MEMO_VERSION, type InvestmentMemoContent } from "./assemble";

const MAX_VERSION_ATTEMPTS = 3;

function isVersionCollision(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function generateInvestmentMemo(prisma: PrismaClient, actor: Actor, opportunityId: string, now = new Date()) {
  const bundle = await loadOpportunityEvidence(prisma, actor.id, opportunityId, { now });
  const content = assembleInvestmentMemo(bundle);

  // Versions are allocated as max+1; the (opportunityId, version) unique constraint turns a
  // concurrent allocation into a retry instead of a duplicate version.
  for (let attempt = 1; ; attempt += 1) {
    try {
      const memo = await prisma.$transaction(async (tx) => {
        const latest = await tx.investmentMemo.aggregate({ where: { opportunityId, userId: actor.id }, _max: { version: true } });
        const version = (latest._max.version ?? 0) + 1;
        const created = await tx.investmentMemo.create({
          data: {
            userId: actor.id,
            opportunityId,
            version,
            title: `${bundle.company.name}: IC memo v${version}`,
            content: content as unknown as Prisma.InputJsonObject,
            contentVersion: IC_MEMO_VERSION,
            claimCount: content.counts.claims,
            sourceCount: content.counts.sources,
            generatedAt: now,
          },
          select: { id: true, version: true, title: true },
        });
        await tx.opportunityEvent.create({
          data: {
            userId: actor.id,
            opportunityId,
            type: OpportunityEventType.MEMO_GENERATED,
            actor: actor.email,
            metadata: { memoId: created.id, version },
          },
        });
        return created;
      });
      await audit(prisma, {
        userId: actor.id,
        actor: "LargeVCModel",
        action: "IC memo draft generated",
        outcome: "completed",
        dataSource: "Stored claims, sources, pipeline and relationship records",
        details: `Version ${memo.version}: ${content.counts.claims} claims, ${content.counts.sources} sources, ${content.missingInformation.length} gaps.`,
        metadata: { opportunityId, memoId: memo.id, requestedBy: actor.email },
      });
      return memo;
    } catch (error) {
      if (!isVersionCollision(error) || attempt >= MAX_VERSION_ATTEMPTS) throw error;
    }
  }
}

export async function getInvestmentMemo(prisma: PrismaClient, userId: string, memoId: string) {
  const memo = await prisma.investmentMemo.findFirst({ where: { id: memoId, userId } });
  if (!memo) return null;
  if (memo.contentVersion !== IC_MEMO_VERSION) {
    throw new ApiError(422, `Stored memo format ${memo.contentVersion} is not supported by this version of LargeVCModel.`, "UNSUPPORTED_MEMO_VERSION");
  }
  return { ...memo, content: memo.content as unknown as InvestmentMemoContent };
}

export function listInvestmentMemos(prisma: PrismaClient, userId: string, opportunityId: string) {
  return prisma.investmentMemo.findMany({
    where: { userId, opportunityId },
    orderBy: { version: "desc" },
    take: 20,
    select: { id: true, title: true, version: true, status: true, generatedAt: true, finalizedAt: true, claimCount: true, sourceCount: true },
  });
}

/** Marks a draft as the version presented to IC. Finalized memos cannot change. */
export async function finalizeInvestmentMemo(prisma: PrismaClient, actor: Actor, memoId: string, reviewerNotes: string | null, now = new Date()) {
  const memo = await prisma.$transaction(async (tx) => {
    const result = await tx.investmentMemo.updateMany({
      where: { id: memoId, userId: actor.id, status: "DRAFT" },
      data: { status: "FINALIZED", finalizedAt: now, finalizedBy: actor.email, reviewerNotes },
    });
    const current = await tx.investmentMemo.findFirst({ where: { id: memoId, userId: actor.id }, select: { id: true, opportunityId: true, version: true, status: true } });
    if (!current) throw new ApiError(404, "IC memo not found", "MEMO_NOT_FOUND");
    if (result.count === 0) throw new ApiError(409, "This memo is already finalized.", "MEMO_ALREADY_FINALIZED");
    await tx.opportunityEvent.create({
      data: {
        userId: actor.id,
        opportunityId: current.opportunityId,
        type: OpportunityEventType.MEMO_FINALIZED,
        actor: actor.email,
        metadata: { memoId, version: current.version },
      },
    });
    return current;
  });
  await audit(prisma, {
    userId: actor.id,
    actor: actor.email,
    actorType: "USER",
    action: "IC memo finalized",
    outcome: "completed",
    dataSource: "Human review",
    details: `Version ${memo.version} finalized for investment committee.`,
    metadata: { memoId, opportunityId: memo.opportunityId },
  });
  return memo;
}
