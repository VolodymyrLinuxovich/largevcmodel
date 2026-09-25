import "server-only";

import type { OpportunityStage, PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/api/errors";
import { calculateRelationshipHealth, type RelationshipHealth } from "@/lib/domain/relationship-health";
import { loadHealthCoverage, loadHealthInputs } from "@/lib/domain/relationship-health-service";
import type { StoredClaim } from "./classify";

export type BundleMeeting = {
  id: string;
  title: string | null;
  startsAt: Date;
  endsAt: Date;
  attendees: string[];
  htmlLink: string | null;
  contactId: string | null;
};

export type EvidenceBundle = {
  now: Date;
  opportunity: {
    id: string;
    title: string | null;
    stage: OpportunityStage;
    priority: string;
    source: string;
    sourceDetail: string | null;
    ownerName: string | null;
    nextAction: string | null;
    nextActionAt: Date | null;
    notes: string | null;
    passReason: string | null;
    stageChangedAt: Date;
    createdAt: Date;
  };
  company: {
    id: string;
    name: string;
    domain: string | null;
    website: string | null;
    description: string | null;
    sector: string | null;
    stage: string | null;
    geography: string | null;
    businessModel: string | null;
    source: string;
    updatedAt: Date;
  };
  thesis: {
    id: string;
    name: string;
    targetSectors: string[];
    stages: string[];
    geographies: string[];
    checkSizeMin: number | null;
    checkSizeMax: number | null;
    exclusionCriteria: string | null;
  } | null;
  fitScore: {
    id: string;
    overall: number;
    confidence: number;
    criteria: Record<string, number>;
    weights: Record<string, number>;
    missingInfo: string[];
    explanation: string;
    modelOrProvider: string;
    calculatedAt: Date;
  } | null;
  people: Array<{
    contactId: string;
    name: string;
    email: string | null;
    title: string | null;
    organization: string | null;
    role: string;
    health: RelationshipHealth;
  }>;
  introducer: { contactId: string; name: string } | null;
  claims: Array<StoredClaim & { subject: "company" | "contact"; contactId: string | null }>;
  emails: Array<{
    id: string;
    subject: string | null;
    snippet: string | null;
    lastMessageAt: Date | null;
    messageCount: number;
    hasUserReply: boolean;
    threadUrl: string | null;
    contactId: string | null;
  }>;
  meetings: BundleMeeting[];
  edges: Array<{ id: string; toNodeId: string; relationship: string; source: string; strength: number; evidence: string }>;
  stageEvents: Array<{ fromStage: OpportunityStage | null; toStage: OpportunityStage | null; note: string | null; createdAt: Date }>;
  targetMeeting: BundleMeeting | null;
  coverage: { gmailConnected: boolean; calendarConnected: boolean };
};

function numberRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === "number"));
}

const meetingSelect = { id: true, title: true, startsAt: true, endsAt: true, attendees: true, htmlLink: true, contactId: true } as const;

/**
 * Loads everything a brief or memo may cite for one opportunity, in a fixed number of queries.
 * Every query is filtered by userId; a foreign opportunity or calendar event yields a 404.
 */
export async function loadOpportunityEvidence(
  prisma: PrismaClient,
  userId: string,
  opportunityId: string,
  options: { now?: Date; calendarEventId?: string | null } = {},
): Promise<EvidenceBundle> {
  const now = options.now ?? new Date();
  const opportunity = await prisma.opportunity.findFirst({
    where: { id: opportunityId, userId },
    include: {
      company: true,
      thesis: true,
      currentFitScore: true,
      introducedBy: { select: { id: true, fullName: true, primaryEmail: true } },
      contacts: {
        orderBy: { createdAt: "asc" },
        select: {
          role: true,
          contact: { select: { id: true, fullName: true, primaryEmail: true, emails: true, title: true, organization: true } },
        },
      },
      events: {
        where: { type: "STAGE_CHANGED" },
        orderBy: { createdAt: "asc" },
        select: { fromStage: true, toStage: true, note: true, createdAt: true },
      },
    },
  });
  if (!opportunity) throw new ApiError(404, "Opportunity not found", "OPPORTUNITY_NOT_FOUND");

  const contactIds = opportunity.contacts.map((link) => link.contact.id);
  const emails = Array.from(
    new Set(
      opportunity.contacts
        .flatMap((link) => [link.contact.primaryEmail, ...link.contact.emails])
        .filter((email): email is string => Boolean(email))
        .map((email) => email.toLowerCase()),
    ),
  );
  const personFilter = <T extends string>(idField: T, emailField: string) => [
    ...(contactIds.length ? [{ [idField]: { in: contactIds } }] : []),
    ...(emails.length ? [{ [emailField]: { hasSome: emails } }] : []),
  ];
  const threadFilter = personFilter("contactId", "participantEmails");
  const meetingFilter = personFilter("contactId", "attendees");

  const [coverage, claims, threads, meetings, edges, targetMeeting, thesis] = await Promise.all([
    loadHealthCoverage(prisma, userId),
    prisma.researchClaim.findMany({
      where: {
        userId,
        OR: [{ companyId: opportunity.companyId }, ...(contactIds.length ? [{ contactId: { in: contactIds } }] : [])],
      },
      orderBy: { extractedAt: "desc" },
      take: 200,
      include: { sources: { include: { source: true } } },
    }),
    threadFilter.length
      ? prisma.gmailThread.findMany({
          where: { userId, OR: threadFilter },
          orderBy: { lastMessageAt: "desc" },
          take: 25,
          select: {
            id: true,
            subject: true,
            snippet: true,
            lastMessageAt: true,
            messageCount: true,
            hasUserReply: true,
            threadUrl: true,
            contactId: true,
          },
        })
      : [],
    meetingFilter.length
      ? prisma.calendarEvent.findMany({ where: { userId, OR: meetingFilter }, orderBy: { startsAt: "desc" }, take: 40, select: meetingSelect })
      : [],
    contactIds.length
      ? prisma.relationshipEdge.findMany({
          where: { userId, toNodeId: { in: contactIds } },
          select: { id: true, toNodeId: true, relationship: true, source: true, strength: true, evidence: true },
        })
      : [],
    options.calendarEventId
      ? prisma.calendarEvent.findFirst({ where: { id: options.calendarEventId, userId }, select: meetingSelect })
      : null,
    opportunity.thesis
      ? Promise.resolve(opportunity.thesis)
      : prisma.investmentThesis.findFirst({ where: { userId, active: true }, orderBy: { updatedAt: "desc" } }),
  ]);
  if (options.calendarEventId && !targetMeeting) throw new ApiError(404, "Calendar event not found", "CALENDAR_EVENT_NOT_FOUND");

  const healthInputs = await loadHealthInputs(prisma, userId, contactIds, now, coverage);
  const fit = opportunity.currentFitScore;

  return {
    now,
    opportunity: {
      id: opportunity.id,
      title: opportunity.title,
      stage: opportunity.stage,
      priority: opportunity.priority,
      source: opportunity.source,
      sourceDetail: opportunity.sourceDetail,
      ownerName: opportunity.ownerName,
      nextAction: opportunity.nextAction,
      nextActionAt: opportunity.nextActionAt,
      notes: opportunity.notes,
      passReason: opportunity.passReason,
      stageChangedAt: opportunity.stageChangedAt,
      createdAt: opportunity.createdAt,
    },
    company: opportunity.company,
    thesis: thesis
      ? {
          id: thesis.id,
          name: thesis.name,
          targetSectors: thesis.targetSectors,
          stages: thesis.stages,
          geographies: thesis.geographies,
          checkSizeMin: thesis.checkSizeMin,
          checkSizeMax: thesis.checkSizeMax,
          exclusionCriteria: thesis.exclusionCriteria,
        }
      : null,
    fitScore: fit
      ? {
          id: fit.id,
          overall: fit.overall,
          confidence: fit.confidence,
          criteria: numberRecord(fit.criteria),
          weights: numberRecord(fit.weights),
          missingInfo: fit.missingInfo,
          explanation: fit.explanation,
          modelOrProvider: fit.modelOrProvider,
          calculatedAt: fit.calculatedAt,
        }
      : null,
    people: opportunity.contacts.map((link) => ({
      contactId: link.contact.id,
      name: link.contact.fullName ?? link.contact.primaryEmail ?? "Unnamed contact",
      email: link.contact.primaryEmail,
      title: link.contact.title,
      organization: link.contact.organization,
      role: link.role,
      health: calculateRelationshipHealth(healthInputs.get(link.contact.id)!),
    })),
    introducer: opportunity.introducedBy
      ? { contactId: opportunity.introducedBy.id, name: opportunity.introducedBy.fullName ?? opportunity.introducedBy.primaryEmail ?? "Unnamed contact" }
      : null,
    claims: claims.map((claim) => ({
      id: claim.id,
      text: claim.text,
      category: claim.category,
      provenance: claim.provenance,
      confidence: claim.confidence,
      extractedAt: claim.extractedAt,
      subject: claim.companyId === opportunity.companyId ? "company" : "contact",
      contactId: claim.contactId,
      sources: claim.sources.map((join) => join.source),
    })),
    emails: threads,
    meetings,
    edges,
    stageEvents: opportunity.events,
    targetMeeting,
    coverage,
  };
}
