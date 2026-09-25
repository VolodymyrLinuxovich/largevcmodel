import "server-only";

import type { OpportunityStage, Prisma, PrismaClient } from "@prisma/client";
import { calculateRelationshipHealth } from "@/lib/domain/relationship-health";
import { loadHealthInputs } from "@/lib/domain/relationship-health-service";
import { summarizeOpportunityRelationships, type LinkedContactHealth } from "./relationship-summary";

const linkedContactSelect = {
  role: true,
  contact: {
    select: {
      id: true,
      fullName: true,
      primaryEmail: true,
      title: true,
      organization: true,
      lastInteractionAt: true,
    },
  },
} satisfies Prisma.OpportunityContactSelect;

type LinkedContactRow = Prisma.OpportunityContactGetPayload<{ select: typeof linkedContactSelect }>;

type LiveHealth = { score: number | null; state: LinkedContactHealth["healthState"]; calculatedAt: Date };

/**
 * Stored health decays with time, so views compute it live for the people they display. The
 * loader uses a fixed number of queries regardless of how many contacts are passed.
 */
async function liveHealthFor(prisma: PrismaClient, userId: string, contactIds: string[], now: Date) {
  const unique = Array.from(new Set(contactIds));
  const inputs = await loadHealthInputs(prisma, userId, unique, now);
  const result = new Map<string, LiveHealth>();
  for (const id of unique) {
    const health = calculateRelationshipHealth(inputs.get(id)!);
    result.set(id, { score: health.score, state: health.state, calculatedAt: now });
  }
  return result;
}

function toLinkedHealth(link: LinkedContactRow, live: Map<string, LiveHealth>): LinkedContactHealth {
  const health = live.get(link.contact.id);
  return {
    contactId: link.contact.id,
    name: link.contact.fullName ?? link.contact.primaryEmail ?? "Unnamed contact",
    role: link.role,
    healthScore: health?.score ?? null,
    healthState: health?.state ?? null,
    healthCalculatedAt: health?.calculatedAt ?? null,
  };
}

const CLOSED_STAGES: OpportunityStage[] = ["INVESTED", "PASSED"];

const cardSelect = {
  id: true,
  title: true,
  stage: true,
  priority: true,
  ownerName: true,
  source: true,
  nextAction: true,
  nextActionAt: true,
  stageChangedAt: true,
  updatedAt: true,
  version: true,
  company: { select: { id: true, name: true, sector: true, stage: true } },
  currentFitScore: { select: { overall: true, confidence: true, calculatedAt: true } },
  contacts: { select: linkedContactSelect },
} satisfies Prisma.OpportunitySelect;

/**
 * Pipeline cards for a user. Open deals are loaded separately from the most recent closed deals so a
 * long history of passed deals can never push open ones off the board.
 */
export async function listPipeline(
  prisma: PrismaClient,
  userId: string,
  filters: { stage?: OpportunityStage } = {},
  now = new Date(),
) {
  const orderBy: Prisma.OpportunityOrderByWithRelationInput[] = [
    { priority: "desc" },
    { nextActionAt: { sort: "asc", nulls: "last" } },
    { updatedAt: "desc" },
  ];
  const [open, closed] = await Promise.all([
    prisma.opportunity.findMany({
      where: { userId, stage: filters.stage ? filters.stage : { notIn: CLOSED_STAGES } },
      orderBy,
      take: 1000,
      select: cardSelect,
    }),
    filters.stage
      ? Promise.resolve([])
      : prisma.opportunity.findMany({
          where: { userId, stage: { in: CLOSED_STAGES } },
          orderBy: { stageChangedAt: "desc" },
          take: 100,
          select: cardSelect,
        }),
  ]);
  const opportunities = [...open, ...closed];
  const live = await liveHealthFor(prisma, userId, opportunities.flatMap((item) => item.contacts.map((link) => link.contact.id)), now);
  return opportunities.map(({ contacts, ...opportunity }) => ({
    ...opportunity,
    relationship: summarizeOpportunityRelationships(contacts.map((link) => toLinkedHealth(link, live))),
  }));
}

export type PipelineCard = Awaited<ReturnType<typeof listPipeline>>[number];

export async function getOpportunityDetail(prisma: PrismaClient, userId: string, id: string, now = new Date()) {
  const opportunity = await prisma.opportunity.findFirst({
    where: { id, userId },
    include: {
      company: true,
      thesis: true,
      currentFitScore: true,
      introducedBy: { select: { id: true, fullName: true, primaryEmail: true } },
      contacts: { select: linkedContactSelect, orderBy: { createdAt: "asc" } },
      events: { orderBy: { createdAt: "desc" }, take: 100 },
    },
  });
  if (!opportunity) return null;
  const live = await liveHealthFor(prisma, userId, opportunity.contacts.map((link) => link.contact.id), now);
  const people = opportunity.contacts.map((link) => toLinkedHealth(link, live));
  return {
    ...opportunity,
    contacts: opportunity.contacts.map((link, index) => ({ ...link, health: people[index]! })),
    relationship: summarizeOpportunityRelationships(people),
  };
}

export type OpportunityDetail = NonNullable<Awaited<ReturnType<typeof getOpportunityDetail>>>;
