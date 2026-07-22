import { ClaimProvenance, PrismaClient, ResearchStatus } from "@prisma/client";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { canonicalizeUrl, dedupeSources } from "./sources";
import { calculateFitScore, DEFAULT_SCORING_WEIGHTS } from "./scoring";
import { researchWithConfiguredProvider } from "@/lib/research/provider";

export const queryRequestSchema = z.object({
  query: z.string().min(2).max(1000),
  stage: z.string().optional(),
  sector: z.string().optional(),
  geography: z.string().optional(),
  relationshipStrength: z.coerce.number().min(0).max(10).optional(),
});

export const researchRequestSchema = z.object({
  contactId: z.string().min(1).optional(),
  companyId: z.string().min(1).optional(),
  query: z.string().min(2).max(1000),
});

function claimProvenance(value: string) {
  if (value === "public_research") return ClaimProvenance.PUBLIC_RESEARCH;
  if (value === "connected_account") return ClaimProvenance.CONNECTED_ACCOUNT;
  if (value === "user_provided") return ClaimProvenance.USER_PROVIDED;
  if (value === "ai_inference") return ClaimProvenance.AI_INFERENCE;
  return ClaimProvenance.UNVERIFIED;
}

function terms(query: string) {
  return query
    .toLowerCase()
    .split(/[^a-z0-9@.]+/)
    .filter((term) => term.length > 2)
    .slice(0, 12);
}

export function parseInvestmentIntent(input: {
  query: string;
  stage?: string;
  sector?: string;
  geography?: string;
  relationshipStrength?: number;
}) {
  const lower = input.query.toLowerCase();
  return {
    sectors: input.sector ? [input.sector] : lower.includes("ai") ? ["AI"] : [],
    stages: input.stage ? [input.stage] : lower.includes("seed") ? ["Seed"] : [],
    geographies: input.geography
      ? [input.geography]
      : lower.includes("bay area") || lower.includes("san francisco")
        ? ["Bay Area", "San Francisco"]
        : [],
    minimumRelationshipStrength: input.relationshipStrength,
    rawQuery: input.query,
  };
}

export async function executeResearchQuery(prisma: PrismaClient, userId: string, input: z.infer<typeof queryRequestSchema>) {
  const intent = parseInvestmentIntent(input);
  const searchTerms = terms(input.query);
  const filters = [
    ...searchTerms.flatMap((term) => [
      { fullName: { contains: term, mode: "insensitive" as const } },
      { primaryEmail: { contains: term, mode: "insensitive" as const } },
      { organization: { contains: term, mode: "insensitive" as const } },
      { title: { contains: term, mode: "insensitive" as const } },
      { notes: { contains: term, mode: "insensitive" as const } },
    ]),
  ];

  const contacts = await prisma.contact.findMany({
    where: {
      userId,
      ...(filters.length ? { OR: filters } : {}),
      ...(input.relationshipStrength !== undefined ? { relationshipStrength: { gte: input.relationshipStrength } } : {}),
    },
    include: {
      company: true,
      fitScores: { orderBy: { calculatedAt: "desc" }, take: 1 },
      gmailThreads: { orderBy: { lastMessageAt: "desc" }, take: 2 },
      calendarEvents: { orderBy: { startsAt: "desc" }, take: 2 },
    },
    orderBy: [{ relationshipStrength: "desc" }, { lastInteractionAt: "desc" }],
    take: 25,
  });

  await audit(prisma, {
    userId,
    actor: "LargeVCModel",
    action: "Network search completed",
    outcome: "completed",
    dataSource: "Connected account data",
    details: `${contacts.length} matching contact records returned for a user query.`,
  });

  return { intent, contacts };
}

export async function researchSubject(prisma: PrismaClient, userId: string, input: z.infer<typeof researchRequestSchema>) {
  const [contact, company] = await Promise.all([
    input.contactId
      ? prisma.contact.findFirst({ where: { id: input.contactId, userId }, include: { company: true } })
      : Promise.resolve(null),
    input.companyId ? prisma.company.findFirst({ where: { id: input.companyId, userId } }) : Promise.resolve(null),
  ]);

  if (!contact && !company) {
    throw new Error("Select a real contact or company before starting research.");
  }

  const run = await prisma.researchRun.create({
    data: {
      userId,
      query: input.query,
      subjectType: contact ? "contact" : "company",
      subjectId: contact?.id ?? company?.id,
      provider: process.env.RESEARCH_PROVIDER || "none",
      status: ResearchStatus.RUNNING,
      structuredInput: {
        contactId: contact?.id,
        companyId: contact?.companyId ?? company?.id,
        subject: contact?.fullName ?? company?.name,
      },
      modelOrProvider: process.env.RESEARCH_PROVIDER || "none",
    },
  });

  try {
    const result = await researchWithConfiguredProvider({
      contactId: contact?.id,
      founderName: contact?.fullName,
      companyName: contact?.organization ?? contact?.company?.name ?? company?.name,
      companyId: contact?.companyId ?? company?.id,
      query: input.query,
      sector: company?.sector ?? contact?.company?.sector,
      stage: company?.stage ?? contact?.company?.stage,
      geography: company?.geography,
    });

    const sources = await Promise.all(
      dedupeSources(result.sources).map(async (source) => {
        const canonicalUrl = canonicalizeUrl(source.url);
        return prisma.source.upsert({
          where: { userId_canonicalUrl: { userId, canonicalUrl } },
          create: {
            userId,
            contactId: source.contactId ?? contact?.id ?? null,
            companyId: source.companyId ?? contact?.companyId ?? company?.id ?? null,
            title: source.title,
            url: source.url,
            canonicalUrl,
            publisher: source.publisher ?? null,
            publishedAt: source.publishedAt ? new Date(source.publishedAt) : null,
            accessedAt: new Date(source.accessedAt),
            sourceType: source.sourceType,
            origin: source.origin,
            snippet: source.snippet ?? null,
            supportsClaims: source.supportsClaims,
          },
          update: {
            title: source.title,
            publisher: source.publisher ?? null,
            publishedAt: source.publishedAt ? new Date(source.publishedAt) : null,
            accessedAt: new Date(source.accessedAt),
            sourceType: source.sourceType,
            origin: source.origin,
            snippet: source.snippet ?? null,
            supportsClaims: source.supportsClaims,
          },
        });
      }),
    );

    const sourcesByCanonicalUrl = new Map(sources.map((source) => [source.canonicalUrl, source]));

    for (const claim of result.claims) {
      const storedClaim = await prisma.researchClaim.create({
        data: {
          userId,
          researchRunId: run.id,
          contactId: claim.contactId ?? contact?.id ?? null,
          companyId: claim.companyId ?? contact?.companyId ?? company?.id ?? null,
          text: claim.text,
          category: claim.category,
          provenance: claimProvenance(claim.provenance),
          confidence: claim.confidence ?? null,
        },
      });

      for (const sourceUrl of claim.sourceUrls ?? []) {
        const source = sourcesByCanonicalUrl.get(canonicalizeUrl(sourceUrl));
        if (!source) continue;
        await prisma.claimSource.create({
          data: { claimId: storedClaim.id, sourceId: source.id, supportedClaim: claim.text },
        });
      }
    }

    await prisma.researchRun.update({
      where: { id: run.id },
      data: {
        status: ResearchStatus.COMPLETED,
        summary: result.summary,
        provider: result.provider,
        completedAt: new Date(),
      },
    });

    await audit(prisma, {
      userId,
      actor: "Hermes research provider",
      action: "Research completed",
      outcome: "completed",
      affectedContactId: contact?.id,
      dataSource: result.provider,
      details: `${sources.length} sources and ${result.claims.length} claims persisted with provenance.`,
      researchRunId: run.id,
    });

    return prisma.researchRun.findUnique({
      where: { id: run.id },
      include: {
        claims: { include: { sources: { include: { source: true } } } },
        fitScores: true,
      },
    });
  } catch (error) {
    await prisma.researchRun.update({
      where: { id: run.id },
      data: {
        status: ResearchStatus.UNAVAILABLE,
        error: error instanceof Error ? error.message : "Research provider unavailable",
        completedAt: new Date(),
      },
    });
    await audit(prisma, {
      userId,
      actor: "Research provider",
      action: "Research failed",
      outcome: "unavailable",
      affectedContactId: contact?.id,
      dataSource: process.env.RESEARCH_PROVIDER || "none",
      details: error instanceof Error ? error.message : "Research provider unavailable",
      researchRunId: run.id,
    });
    return prisma.researchRun.findUnique({ where: { id: run.id }, include: { claims: true, fitScores: true } });
  }
}

export async function scoreContact(prisma: PrismaClient, userId: string, contactId: string) {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, userId },
    include: { company: true, claims: true, sources: true },
  });
  if (!contact) throw new Error("Contact not found");

  const thesis = await prisma.investmentThesis.findFirst({ where: { userId, active: true }, orderBy: { updatedAt: "desc" } });
  const score = calculateFitScore(
    {
      contactId: contact.id,
      companyId: contact.companyId,
      fullName: contact.fullName,
      organization: contact.organization ?? contact.company?.name,
      title: contact.title,
      sector: contact.company?.sector,
      stage: contact.company?.stage,
      geography: contact.company?.geography,
      relationshipStrength: contact.relationshipStrength,
      interactionCount: contact.interactionCount,
      lastInteractionAt: contact.lastInteractionAt,
      sourceCount: contact.sources.length,
      supportedClaimCount: contact.claims.length,
      thesis,
    },
    DEFAULT_SCORING_WEIGHTS,
  );

  const stored = await prisma.fitScore.create({
    data: {
      userId,
      contactId: contact.id,
      companyId: contact.companyId,
      thesisId: thesis?.id,
      overall: score.overall,
      confidence: score.confidence,
      criteria: {
        thesisMatch: score.thesisMatch,
        stageFit: score.stageFit,
        geographyFit: score.geographyFit,
        momentum: score.momentum,
        relationship: score.relationship,
        evidence: score.evidence,
      },
      weights: score.weights,
      missingInfo: score.missingInfo,
      explanation: score.explanation,
      modelOrProvider: "LargeVCModel heuristic v1",
    },
  });

  await audit(prisma, {
    userId,
    actor: "LargeVCModel",
    action: "Fit score generated",
    outcome: "completed",
    affectedContactId: contact.id,
    dataSource: "Research claims and connected-account metadata",
    details: `Overall score ${stored.overall} with confidence ${stored.confidence}.`,
  });

  return stored;
}
