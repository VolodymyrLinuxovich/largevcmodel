import "server-only";

import type { OpportunityStage, Prisma, PrismaClient } from "@prisma/client";
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
      healthScore: true,
      healthState: true,
      healthCalculatedAt: true,
      nextFollowUpAt: true,
      lastInteractionAt: true,
    },
  },
} satisfies Prisma.OpportunityContactSelect;

type LinkedContactRow = Prisma.OpportunityContactGetPayload<{ select: typeof linkedContactSelect }>;

function toLinkedHealth(link: LinkedContactRow): LinkedContactHealth {
  return {
    contactId: link.contact.id,
    name: link.contact.fullName ?? link.contact.primaryEmail ?? "Unnamed contact",
    role: link.role,
    healthScore: link.contact.healthScore,
    healthState: link.contact.healthState,
    healthCalculatedAt: link.contact.healthCalculatedAt,
  };
}

/** All pipeline cards for a user in a single query (nested relations are batched by Prisma). */
export async function listPipeline(prisma: PrismaClient, userId: string, filters: { stage?: OpportunityStage } = {}) {
  const opportunities = await prisma.opportunity.findMany({
    where: { userId, ...(filters.stage ? { stage: filters.stage } : {}) },
    orderBy: [{ priority: "desc" }, { nextActionAt: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }],
    take: 500,
    select: {
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
    },
  });
  return opportunities.map(({ contacts, ...opportunity }) => ({
    ...opportunity,
    relationship: summarizeOpportunityRelationships(contacts.map(toLinkedHealth)),
  }));
}

export type PipelineCard = Awaited<ReturnType<typeof listPipeline>>[number];

export async function getOpportunityDetail(prisma: PrismaClient, userId: string, id: string) {
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
  return {
    ...opportunity,
    relationship: summarizeOpportunityRelationships(opportunity.contacts.map(toLinkedHealth)),
  };
}

export type OpportunityDetail = NonNullable<Awaited<ReturnType<typeof getOpportunityDetail>>>;
