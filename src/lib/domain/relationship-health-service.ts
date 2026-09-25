import "server-only";

import {
  ContactInteractionType,
  IntegrationService,
  IntegrationStatus,
  Prisma,
  type PrismaClient,
  type RelationshipHealthState,
} from "@prisma/client";
import {
  calculateRelationshipHealth,
  HEALTH_ALGORITHM_VERSION,
  HEALTH_PARAMETERS,
  type RelationshipHealth,
  type RelationshipHealthInput,
} from "./relationship-health";

const DAY_MS = 86_400_000;
const CHUNK_SIZE = 200;
const DIRECT_TYPES = [
  ContactInteractionType.EMAIL_SENT,
  ContactInteractionType.EMAIL_RECEIVED,
  ContactInteractionType.CALENDAR_MEETING,
];

export async function loadHealthCoverage(prisma: PrismaClient, userId: string): Promise<RelationshipHealthInput["coverage"]> {
  const integrations = await prisma.integration.findMany({
    where: { userId, status: IntegrationStatus.CONNECTED },
    select: { service: true },
  });
  return {
    gmailConnected: integrations.some((integration) => integration.service === IntegrationService.GMAIL),
    calendarConnected: integrations.some((integration) => integration.service === IntegrationService.GOOGLE_CALENDAR),
  };
}

/**
 * Loads health inputs for many contacts with a fixed number of queries (no per-contact queries).
 * Every query is scoped by userId, so foreign contact IDs simply produce no data.
 */
export async function loadHealthInputs(
  prisma: PrismaClient,
  userId: string,
  contactIds: string[],
  now: Date,
  coverage?: RelationshipHealthInput["coverage"],
): Promise<Map<string, RelationshipHealthInput>> {
  const inputs = new Map<string, RelationshipHealthInput>();
  if (!contactIds.length) return inputs;
  const resolvedCoverage = coverage ?? (await loadHealthCoverage(prisma, userId));
  const lookbackStart = new Date(now.getTime() - HEALTH_PARAMETERS.lookbackDays * DAY_MS);

  const [interactions, lifetime, edges] = await Promise.all([
    prisma.contactInteraction.findMany({
      where: { userId, contactId: { in: contactIds }, occurredAt: { gte: lookbackStart } },
      select: { contactId: true, type: true, occurredAt: true },
    }),
    prisma.contactInteraction.groupBy({
      by: ["contactId"],
      where: { userId, contactId: { in: contactIds }, type: { in: DIRECT_TYPES }, occurredAt: { lte: now } },
      _count: { _all: true },
      _min: { occurredAt: true },
    }),
    prisma.relationshipEdge.findMany({
      where: { userId, fromNodeId: userId, toNodeType: "contact", toNodeId: { in: contactIds } },
      select: { toNodeId: true, relationship: true, source: true, strength: true },
    }),
  ]);

  for (const contactId of contactIds) {
    inputs.set(contactId, { now, interactions: [], lifetime: null, edges: [], coverage: resolvedCoverage });
  }
  for (const interaction of interactions) {
    inputs.get(interaction.contactId)?.interactions.push({ type: interaction.type, occurredAt: interaction.occurredAt });
  }
  for (const row of lifetime) {
    const input = inputs.get(row.contactId);
    if (input) input.lifetime = { directCount: row._count._all, firstAt: row._min.occurredAt };
  }
  for (const edge of edges) {
    inputs.get(edge.toNodeId)?.edges?.push({ relationship: edge.relationship, source: edge.source, strength: edge.strength });
  }
  return inputs;
}

/** Computes health for one contact without writing anything. Returns null when the contact is not owned by the user. */
export async function getContactRelationshipHealth(prisma: PrismaClient, userId: string, contactId: string, now = new Date()) {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, userId }, select: { id: true } });
  if (!contact) return null;
  const inputs = await loadHealthInputs(prisma, userId, [contact.id], now);
  return calculateRelationshipHealth(inputs.get(contact.id)!);
}

type PersistedHealth = {
  id: string;
  healthScore: number | null;
  healthState: RelationshipHealthState | null;
  nextFollowUpAt: Date | null;
};

export function healthChanged(previous: PersistedHealth, next: RelationshipHealth) {
  return (
    previous.healthState !== next.state ||
    previous.healthScore !== next.score ||
    (previous.nextFollowUpAt?.getTime() ?? null) !== (next.followUp.recommendedAt?.getTime() ?? null)
  );
}

/**
 * Recomputes and persists health for the given contacts (or every contact of the user).
 * Contact denormalized fields are updated for every recalculated contact so `healthCalculatedAt`
 * is truthful; a history snapshot is appended only when the result changed.
 */
export async function refreshRelationshipHealth(
  prisma: PrismaClient,
  userId: string,
  options: { contactIds?: string[]; now?: Date } = {},
) {
  const now = options.now ?? new Date();
  const coverage = await loadHealthCoverage(prisma, userId);
  const where: Prisma.ContactWhereInput = options.contactIds
    ? { userId, id: { in: Array.from(new Set(options.contactIds)) } }
    : { userId };
  const contacts = await prisma.contact.findMany({
    where,
    select: { id: true, healthScore: true, healthState: true, nextFollowUpAt: true },
    orderBy: { id: "asc" },
  });

  const results = new Map<string, RelationshipHealth>();
  let changed = 0;
  for (let offset = 0; offset < contacts.length; offset += CHUNK_SIZE) {
    const chunk = contacts.slice(offset, offset + CHUNK_SIZE);
    const inputs = await loadHealthInputs(prisma, userId, chunk.map((contact) => contact.id), now, coverage);
    const snapshots: Prisma.RelationshipHealthSnapshotCreateManyInput[] = [];
    const updates: Prisma.PrismaPromise<unknown>[] = [];

    for (const contact of chunk) {
      const health = calculateRelationshipHealth(inputs.get(contact.id)!);
      results.set(contact.id, health);
      const didChange = healthChanged(contact, health);
      updates.push(
        prisma.contact.updateMany({
          where: { id: contact.id, userId },
          data: {
            healthScore: health.score,
            healthState: health.state,
            healthCalculatedAt: now,
            nextFollowUpAt: health.followUp.recommendedAt,
          },
        }),
      );
      if (didChange) {
        changed += 1;
        snapshots.push({
          userId,
          contactId: contact.id,
          state: health.state,
          score: health.score,
          previousState: contact.healthState,
          previousScore: contact.healthScore,
          lastInteractionAt: health.lastInteractionAt,
          nextFollowUpAt: health.followUp.recommendedAt,
          components: health.components as unknown as Prisma.InputJsonArray,
          evidence: health.evidence as unknown as Prisma.InputJsonArray,
          explanation: health.explanation,
          algorithmVersion: HEALTH_ALGORITHM_VERSION,
          calculatedAt: now,
        });
      }
    }

    await prisma.$transaction([
      ...updates,
      ...(snapshots.length ? [prisma.relationshipHealthSnapshot.createMany({ data: snapshots })] : []),
    ]);
  }

  return { calculated: contacts.length, changed, results };
}
