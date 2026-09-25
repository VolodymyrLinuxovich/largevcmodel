import "server-only";

import { Prisma, type PrismaClient, type WatchEntityType } from "@prisma/client";
import { ApiError } from "@/lib/api/errors";
import { audit } from "@/lib/audit";
import { refreshRelationshipHealth } from "@/lib/domain/relationship-health-service";
import type { Actor } from "@/lib/pipeline/service";
import { deriveSignals, type WatchTarget } from "./signals";

const RECORD_LIMIT = 500;

function targetField(entityType: WatchEntityType) {
  return entityType === "COMPANY" ? "companyId" : entityType === "CONTACT" ? "contactId" : "opportunityId";
}

async function targetExists(prisma: PrismaClient, userId: string, entityType: WatchEntityType, targetId: string) {
  const where = { id: targetId, userId };
  if (entityType === "COMPANY") return Boolean(await prisma.company.findFirst({ where, select: { id: true } }));
  if (entityType === "CONTACT") return Boolean(await prisma.contact.findFirst({ where, select: { id: true } }));
  return Boolean(await prisma.opportunity.findFirst({ where, select: { id: true } }));
}

/** Idempotent: watching something already watched returns the existing item. */
export async function addToWatchlist(prisma: PrismaClient, actor: Actor, input: { entityType: WatchEntityType; targetId: string; note?: string | null }) {
  if (!(await targetExists(prisma, actor.id, input.entityType, input.targetId))) {
    throw new ApiError(404, "Watch target not found", "WATCH_TARGET_NOT_FOUND");
  }
  const field = targetField(input.entityType);
  const existing = await prisma.watchlistItem.findFirst({ where: { userId: actor.id, [field]: input.targetId } });
  if (existing) return { item: existing, created: false };
  try {
    const item = await prisma.watchlistItem.create({
      data: { userId: actor.id, entityType: input.entityType, [field]: input.targetId, note: input.note ?? null },
    });
    await audit(prisma, {
      userId: actor.id,
      actor: actor.email,
      actorType: "USER",
      action: "Watchlist item added",
      outcome: "completed",
      dataSource: "User provided",
      metadata: { itemId: item.id, entityType: input.entityType },
    });
    return { item, created: true };
  } catch (error) {
    // A concurrent request watched the same target between the lookup and the insert.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await prisma.watchlistItem.findFirst({ where: { userId: actor.id, [field]: input.targetId } });
      if (raced) return { item: raced, created: false };
    }
    throw error;
  }
}

export async function removeFromWatchlist(prisma: PrismaClient, actor: Actor, itemId: string) {
  const result = await prisma.watchlistItem.deleteMany({ where: { id: itemId, userId: actor.id } });
  if (result.count === 0) throw new ApiError(404, "Watchlist item not found", "WATCH_ITEM_NOT_FOUND");
  await audit(prisma, {
    userId: actor.id,
    actor: actor.email,
    actorType: "USER",
    action: "Watchlist item removed",
    outcome: "completed",
    dataSource: "User provided",
    metadata: { itemId },
  });
}

export function listWatchlist(prisma: PrismaClient, userId: string) {
  return prisma.watchlistItem.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      company: { select: { id: true, name: true } },
      contact: { select: { id: true, fullName: true, primaryEmail: true, healthState: true, healthScore: true } },
      opportunity: { select: { id: true, stage: true, company: { select: { name: true } } } },
      _count: { select: { signals: { where: { readAt: null } } } },
    },
  });
}

export function listSignals(prisma: PrismaClient, userId: string, options: { unreadOnly?: boolean; limit?: number } = {}) {
  return prisma.watchSignal.findMany({
    where: { userId, ...(options.unreadOnly ? { readAt: null } : {}) },
    orderBy: [{ detectedAt: "desc" }, { occurredAt: "desc" }],
    take: Math.min(options.limit ?? 100, 200),
    include: { watchlistItem: { select: { id: true, entityType: true, companyId: true, contactId: true, opportunityId: true } } },
  });
}

export async function markSignalsRead(prisma: PrismaClient, userId: string, input: { signalIds?: string[]; all?: true }, now = new Date()) {
  const result = await prisma.watchSignal.updateMany({
    where: { userId, readAt: null, ...(input.signalIds ? { id: { in: input.signalIds } } : {}) },
    data: { readAt: now },
  });
  return result.count;
}

/**
 * Derives new signals for every watched item from records stored since it was last checked.
 * `now` is captured before querying and becomes the new checkpoint, so records written during the
 * refresh are picked up next time; the unique dedupeKey makes overlapping refreshes idempotent.
 */
export async function refreshWatchSignals(prisma: PrismaClient, userId: string, now = new Date()) {
  const items = await prisma.watchlistItem.findMany({
    where: { userId },
    include: { opportunity: { select: { companyId: true } } },
  });
  if (!items.length) return { checked: 0, created: 0 };

  const contactIds = items.flatMap((item) => (item.contactId ? [item.contactId] : []));
  if (contactIds.length) await refreshRelationshipHealth(prisma, userId, { contactIds, now });

  const targets: WatchTarget[] = items.map((item) => ({
    id: item.id,
    entityType: item.entityType,
    companyId: item.companyId,
    contactId: item.contactId,
    opportunityId: item.opportunityId,
    opportunityCompanyId: item.opportunity?.companyId ?? null,
    since: item.lastCheckedAt,
  }));
  const companyIds = Array.from(new Set(targets.flatMap((target) => [target.companyId, target.opportunityCompanyId]).filter((value): value is string => Boolean(value))));
  const opportunityIds = targets.flatMap((target) => (target.opportunityId ? [target.opportunityId] : []));
  const since = new Date(Math.min(...targets.map((target) => target.since.getTime())));
  const subjectFilter = [
    ...(companyIds.length ? [{ companyId: { in: companyIds } }] : []),
    ...(contactIds.length ? [{ contactId: { in: contactIds } }] : []),
  ];

  const [claims, sources, interactions, healthSnapshots, stageEvents, fitScores] = await Promise.all([
    subjectFilter.length
      ? prisma.researchClaim.findMany({
          where: { userId, createdAt: { gt: since }, OR: subjectFilter },
          take: RECORD_LIMIT,
          orderBy: { createdAt: "desc" },
          select: { id: true, companyId: true, contactId: true, text: true, provenance: true, createdAt: true, _count: { select: { sources: true } } },
        })
      : [],
    subjectFilter.length
      ? prisma.source.findMany({
          where: { userId, createdAt: { gt: since }, OR: subjectFilter },
          take: RECORD_LIMIT,
          orderBy: { createdAt: "desc" },
          select: { id: true, companyId: true, contactId: true, title: true, origin: true, publisher: true, createdAt: true },
        })
      : [],
    contactIds.length
      ? prisma.contactInteraction.findMany({
          where: { userId, contactId: { in: contactIds }, createdAt: { gt: since }, type: { in: ["EMAIL_SENT", "EMAIL_RECEIVED", "CALENDAR_MEETING"] } },
          take: RECORD_LIMIT,
          orderBy: { createdAt: "desc" },
          select: { id: true, contactId: true, type: true, occurredAt: true, createdAt: true },
        })
      : [],
    contactIds.length
      ? prisma.relationshipHealthSnapshot.findMany({
          where: { userId, contactId: { in: contactIds }, calculatedAt: { gt: since } },
          take: RECORD_LIMIT,
          orderBy: { calculatedAt: "desc" },
          select: { id: true, contactId: true, state: true, score: true, previousState: true, previousScore: true, algorithmVersion: true, calculatedAt: true },
        })
      : [],
    opportunityIds.length || companyIds.length
      ? prisma.opportunityEvent.findMany({
          where: {
            userId,
            type: "STAGE_CHANGED",
            createdAt: { gt: since },
            OR: [
              ...(opportunityIds.length ? [{ opportunityId: { in: opportunityIds } }] : []),
              ...(companyIds.length ? [{ opportunity: { companyId: { in: companyIds } } }] : []),
            ],
          },
          take: RECORD_LIMIT,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            opportunityId: true,
            fromStage: true,
            toStage: true,
            actor: true,
            createdAt: true,
            opportunity: { select: { companyId: true, company: { select: { name: true } } } },
          },
        })
      : [],
    companyIds.length
      ? prisma.fitScore.findMany({
          where: { userId, companyId: { in: companyIds } },
          take: RECORD_LIMIT,
          orderBy: { calculatedAt: "desc" },
          select: { id: true, companyId: true, overall: true, confidence: true, modelOrProvider: true, calculatedAt: true },
        })
      : [],
  ]);

  const candidates = deriveSignals(targets, {
    claims: claims.map(({ _count, ...claim }) => ({ ...claim, sourceCount: _count.sources })),
    sources,
    interactions,
    healthSnapshots,
    stageEvents: stageEvents.map(({ opportunity, ...event }) => ({ ...event, companyId: opportunity.companyId, companyName: opportunity.company.name })),
    fitScores: fitScores.flatMap((score) => (score.companyId ? [{ ...score, companyId: score.companyId }] : [])),
  });

  const [inserted] = await prisma.$transaction([
    prisma.watchSignal.createMany({
      data: candidates.map((candidate) => ({ ...candidate, userId, metadata: candidate.metadata as Prisma.InputJsonObject })),
      skipDuplicates: true,
    }),
    prisma.watchlistItem.updateMany({ where: { userId, id: { in: items.map((item) => item.id) } }, data: { lastCheckedAt: now } }),
  ]);

  await audit(prisma, {
    userId,
    actor: "Watchlist signal detector",
    actorType: "SYSTEM",
    action: "Watchlist signals refreshed",
    outcome: "completed",
    dataSource: "Stored workspace records",
    details: `${items.length} watched items checked; ${inserted.count} new signals.`,
  });
  return { checked: items.length, created: inserted.count };
}
