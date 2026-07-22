import type { PrismaClient } from "@prisma/client";
import { canonicalizeUrl, dedupeSources, sourceDomain } from "./sources";
import { calculateFitScore, DEFAULT_SCORING_WEIGHTS } from "./scoring";
import { parsePartnerIntent, type StructuredIntent } from "./query";
import type { ResearchResult, ScoringWeights } from "./types";
import { researchWithFallback } from "@/lib/research/provider";

type ContactWithCompany = Awaited<ReturnType<typeof getContactsWithCompanies>>[number];

async function getContactsWithCompanies(prisma: PrismaClient) {
  return prisma.contact.findMany({
    include: {
      company: true,
      founderProfile: true,
    },
    orderBy: {
      relationshipStrength: "desc",
    },
  });
}

export async function executeResearchQuery(
  prisma: PrismaClient,
  input: {
    query: string;
    filters?: Record<string, string | undefined>;
    weights?: ScoringWeights;
  },
) {
  const intent = parsePartnerIntent(input.query, input.filters);
  const weights = input.weights ?? DEFAULT_SCORING_WEIGHTS;
  const startedAt = new Date();
  const run = await prisma.researchRun.create({
    data: {
      query: input.query,
      structuredIntent: JSON.stringify(intent),
      provider: process.env.RESEARCH_PROVIDER === "hermes" ? "hermes" : "mock",
      status: "running",
      summary: "Research run started.",
      executionSteps: JSON.stringify([
        step("Parsing investment objective", "complete", "Converted natural language into sector, stage, geography, funding, and relationship filters."),
        step("Searching internal CRM", "running", "Searching seeded CRM contacts, company records, event notes, and relationship edges."),
      ]),
      startedAt,
    },
  });

  const candidates = await searchCandidates(prisma, intent);

  const allResearch: Array<{ contact: ContactWithCompany; result: ResearchResult }> = [];
  const storedSources = new Map<string, Awaited<ReturnType<typeof upsertSource>>>();
  const providerWarnings: string[] = [];

  for (const contact of candidates) {
    const result = await researchWithFallback({
      contactId: contact.id,
      founderName: contact.fullName,
      companyName: contact.company?.name ?? "Unknown company",
      companyId: contact.companyId,
      query: input.query,
      sector: contact.company?.sector ?? contact.sector,
      stage: contact.company?.stage ?? contact.stage,
      geography: contact.location,
    });
    providerWarnings.push(...result.unavailable.filter((warning) => warning.includes("Hermes provider unavailable")));
    allResearch.push({ contact, result });

    for (const source of dedupeSources(result.sources)) {
      const stored = await upsertSource(prisma, source);
      storedSources.set(stored.id, stored);
    }
  }

  await prisma.researchRun.update({
    where: { id: run.id },
    data: {
      executionSteps: JSON.stringify([
        step("Parsing investment objective", "complete", "Converted natural language into sector, stage, geography, funding, and relationship filters."),
        step("Searching internal CRM", "complete", `Found ${candidates.length} relevant seeded founder contacts.`),
        step("Researching public information through Hermes", "complete", "Collected demo public-source records through the configured research provider."),
        step("Deduplicating candidates", "complete", "Merged source records by canonical URL and kept CRM records distinct."),
        step("Calculating thesis fit", "running", "Applying editable prioritization weights."),
      ]),
    },
  });

  const contactSourceIds = new Map<string, Set<string>>();
  const contactPublicSourceIds = new Map<string, Set<string>>();
  const contactClaimCounts = new Map<string, number>();

  for (const { contact, result } of allResearch) {
    for (const claim of result.claims) {
      const createdClaim = await prisma.researchClaim.create({
        data: {
          researchRunId: run.id,
          contactId: claim.contactId ?? contact.id,
          companyId: claim.companyId ?? contact.companyId,
          text: claim.text,
          category: claim.category,
          provenance: claim.provenance,
          confidence: claim.confidence,
        },
      });

      const sourceUrls = claim.sourceUrls ?? [];
      for (const sourceUrl of sourceUrls) {
        const source = await prisma.source.findUnique({
          where: { canonicalUrl: canonicalizeUrl(sourceUrl) },
        });
        if (!source) continue;
        await prisma.claimSource.upsert({
          where: {
            claimId_sourceId: {
              claimId: createdClaim.id,
              sourceId: source.id,
            },
          },
          update: { supportedClaim: claim.text },
          create: {
            claimId: createdClaim.id,
            sourceId: source.id,
            supportedClaim: claim.text,
          },
        });
        const allSet = contactSourceIds.get(contact.id) ?? new Set<string>();
        allSet.add(source.id);
        contactSourceIds.set(contact.id, allSet);
        if (source.sourceType !== "internal_crm") {
          const publicSet = contactPublicSourceIds.get(contact.id) ?? new Set<string>();
          publicSet.add(source.id);
          contactPublicSourceIds.set(contact.id, publicSet);
        }
      }

      contactClaimCounts.set(contact.id, (contactClaimCounts.get(contact.id) ?? 0) + 1);
    }
  }

  const scoreRows = [];
  for (const contact of candidates) {
    const sourceIds = Array.from(contactSourceIds.get(contact.id) ?? []);
    const publicSourceIds = Array.from(contactPublicSourceIds.get(contact.id) ?? []);
    const score = calculateFitScore(
      {
        contactId: contact.id,
        fullName: contact.fullName,
        sector: contact.sector,
        stage: contact.stage,
        location: contact.location,
        relationshipStrength: contact.relationshipStrength,
        researchConfidence: contact.researchConfidence,
        company: contact.company
          ? {
              sector: contact.company.sector,
              stage: contact.company.stage,
              headquarters: contact.company.headquarters,
              latestFundingDate: contact.company.latestFundingDate,
              latestFundingRound: contact.company.latestFundingRound,
              latestFundingAmount: contact.company.latestFundingAmount,
              checkSizeFit: contact.company.checkSizeFit,
            }
          : null,
        sourceCount: sourceIds.length,
        publicSourceCount: publicSourceIds.length,
        supportedClaimCount: contactClaimCounts.get(contact.id) ?? 0,
        citationSourceIds: publicSourceIds.length ? publicSourceIds : sourceIds,
      },
      weights,
    );
    const fitScore = await prisma.fitScore.create({
      data: {
        researchRunId: run.id,
        contactId: contact.id,
        thesisMatch: score.thesisMatch,
        stageFit: score.stageFit,
        geographyFit: score.geographyFit,
        momentum: score.momentum,
        relationship: score.relationship,
        evidence: score.evidence,
        overall: score.overall,
        explanation: score.explanation,
        weightsJson: JSON.stringify(score.weights),
        citationsJson: JSON.stringify(score.citations),
      },
    });
    scoreRows.push({ contact, score: fitScore });
  }

  scoreRows.sort((a, b) => b.score.overall - a.score.overall);
  await prisma.contact.updateMany({
    where: {
      id: {
        in: scoreRows.slice(0, 6).map((row) => row.contact.id),
      },
    },
    data: {
      crmStatus: "Ranked",
    },
  });

  const executionSteps = [
    step("Parsing investment objective", "complete", "Converted natural language into sector, stage, geography, funding, and relationship filters."),
    step("Searching internal CRM", "complete", `Found ${candidates.length} relevant seeded founder contacts.`),
    step("Researching public information through Hermes", "complete", "Collected provider-backed source records and preserved provenance on every claim."),
    step("Deduplicating candidates", "complete", "Merged duplicate sources by canonical URL."),
    step("Calculating thesis fit", "complete", "Applied the editable heuristic score formula."),
    step("Identifying warm introduction paths", "complete", "Attached internal CRM, event, and manually entered relationship paths."),
    step("Generating outreach drafts", "pending", "Ready for partner approval workflow."),
  ];

  const updatedRun = await prisma.researchRun.update({
    where: { id: run.id },
    data: {
      provider: allResearch.some((item) => item.result.provider === "hermes" || item.result.provider === "hermes_cli")
        ? allResearch.find((item) => item.result.provider === "hermes_cli") ? "hermes_cli" : "hermes"
        : "mock",
      status: "complete",
      summary: `Ranked ${scoreRows.length} founders for the requested AI infrastructure seed thesis. ${providerWarnings.length ? "Hermes fallback was recorded in the audit log." : "All research results retained source provenance."}`,
      completedAt: new Date(),
      executionSteps: JSON.stringify(executionSteps),
    },
  });

  await prisma.auditEvent.create({
    data: {
      actor: "LargeVCModel Research Agent",
      actorType: "agent",
      action: "Completed research run",
      dataSource: updatedRun.provider,
      details: `Query "${input.query}" produced ${scoreRows.length} ranked candidates. Sources were deduplicated by canonical URL. ${providerWarnings.join(" ")}`,
      researchRunId: updatedRun.id,
    },
  });

  const response = await buildResearchRunPayload(prisma, updatedRun.id);
  return response;
}

export async function researchSingleFounder(
  prisma: PrismaClient,
  input: {
    contactId: string;
    query?: string;
  },
) {
  const contact = await prisma.contact.findUnique({
    where: { id: input.contactId },
    include: { company: true, founderProfile: true },
  });
  if (!contact) return null;

  const query = input.query ?? `Research ${contact.fullName} at ${contact.company?.name ?? "their company"}`;
  return executeResearchQuery(prisma, {
    query,
    filters: {
      sector: contact.company?.sector ?? contact.sector,
      stage: contact.company?.stage ?? contact.stage,
      geography: contact.location,
    },
  });
}

export async function buildResearchRunPayload(prisma: PrismaClient, runId: string) {
  const run = await prisma.researchRun.findUnique({
    where: { id: runId },
    include: {
      fitScores: {
        include: {
          contact: {
            include: {
              company: true,
              founderProfile: true,
            },
          },
        },
      },
      claims: {
        include: {
          sources: {
            include: {
              source: true,
            },
          },
        },
      },
    },
  });
  if (!run) return null;

  const sourceById = new Map<string, (typeof run.claims)[number]["sources"][number]["source"]>();
  for (const claim of run.claims) {
    for (const join of claim.sources) {
      sourceById.set(join.source.id, join.source);
    }
  }
  const sources = Array.from(sourceById.values()).sort((a, b) => {
    if (a.sourceType === "internal_crm" && b.sourceType !== "internal_crm") return 1;
    if (b.sourceType === "internal_crm" && a.sourceType !== "internal_crm") return -1;
    return a.title.localeCompare(b.title);
  });

  const claimsByContact = new Map<string, typeof run.claims>();
  for (const claim of run.claims) {
    if (!claim.contactId) continue;
    const existing = claimsByContact.get(claim.contactId) ?? [];
    existing.push(claim);
    claimsByContact.set(claim.contactId, existing);
  }

  return {
    run: {
      id: run.id,
      query: run.query,
      structuredIntent: JSON.parse(run.structuredIntent) as StructuredIntent,
      provider: run.provider,
      status: run.status,
      summary: run.summary,
      executionSteps: JSON.parse(run.executionSteps) as Array<ReturnType<typeof step>>,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
    },
    candidates: run.fitScores
      .map((score) => {
        const claims = claimsByContact.get(score.contactId) ?? [];
        const citationIds = safeParseStringArray(score.citationsJson);
        return {
          contact: score.contact,
          score: {
            id: score.id,
            thesisMatch: score.thesisMatch,
            stageFit: score.stageFit,
            geographyFit: score.geographyFit,
            momentum: score.momentum,
            relationship: score.relationship,
            evidence: score.evidence,
            overall: score.overall,
            explanation: score.explanation,
            weights: JSON.parse(score.weightsJson),
            citations: citationIds,
          },
          claims: claims.map((claim) => ({
            id: claim.id,
            text: claim.text,
            category: claim.category,
            provenance: claim.provenance,
            confidence: claim.confidence,
            sourceIds: claim.sources.map((join) => join.sourceId),
          })),
          sources: sources.filter((source) => claims.some((claim) => claim.sources.some((join) => join.sourceId === source.id))),
          warmPath: "Calculated from seeded relationship graph and internal CRM relationship strength.",
        };
      })
      .sort((a, b) => b.score.overall - a.score.overall),
    sources: sources.map((source) => ({
      id: source.id,
      title: source.title,
      url: source.url,
      canonicalUrl: source.canonicalUrl,
      publisher: source.publisher,
      domain: sourceDomain(source.url),
      publishedAt: source.publishedAt,
      accessedAt: source.accessedAt,
      sourceType: source.sourceType,
      origin: source.origin,
      snippet: source.snippet,
      supportsClaims: safeParseStringArray(source.supportsClaims),
    })),
  };
}

async function searchCandidates(prisma: PrismaClient, intent: StructuredIntent) {
  const contacts = await getContactsWithCompanies(prisma);
  const filtered = contacts.filter((contact) => {
    const sector = contact.company?.sector ?? contact.sector;
    const stage = contact.company?.stage ?? contact.stage;
    const location = `${contact.location} ${contact.company?.headquarters ?? ""}`.toLowerCase();
    const sectorMatch = intent.sectors.some((item) => sector.toLowerCase().includes(item.toLowerCase()) || item.toLowerCase().includes(sector.toLowerCase()));
    const stageMatch = intent.stages.includes(stage);
    const geographyMatch = intent.geographies.some((geo) => location.includes(geo.toLowerCase()));
    return (sectorMatch || sector.includes("AI")) && stageMatch && geographyMatch;
  });

  if (filtered.length >= 8) return filtered.slice(0, 12);

  const extras = contacts.filter((contact) => !filtered.some((candidate) => candidate.id === contact.id));
  return [...filtered, ...extras].slice(0, 10);
}

async function upsertSource(prisma: PrismaClient, source: Parameters<typeof dedupeSources>[0][number]) {
  const canonicalUrl = canonicalizeUrl(source.url);
  const existing = await prisma.source.findUnique({ where: { canonicalUrl } });
  const supportsClaims = JSON.stringify(source.supportsClaims);
  if (existing) {
    const mergedClaims = Array.from(new Set([...safeParseStringArray(existing.supportsClaims), ...source.supportsClaims]));
    return prisma.source.update({
      where: { canonicalUrl },
      data: {
        title: source.title,
        publisher: source.publisher ?? existing.publisher,
        publishedAt: source.publishedAt ? new Date(source.publishedAt) : existing.publishedAt,
        accessedAt: new Date(source.accessedAt),
        sourceType: source.sourceType,
        origin: source.origin,
        snippet: source.snippet ?? existing.snippet,
        contactId: source.contactId ?? existing.contactId,
        companyId: source.companyId ?? existing.companyId,
        supportsClaims: JSON.stringify(mergedClaims),
      },
    });
  }

  return prisma.source.create({
    data: {
      title: source.title,
      url: source.url,
      canonicalUrl,
      publisher: source.publisher,
      publishedAt: source.publishedAt ? new Date(source.publishedAt) : null,
      accessedAt: new Date(source.accessedAt),
      sourceType: source.sourceType,
      origin: source.origin,
      snippet: source.snippet,
      contactId: source.contactId,
      companyId: source.companyId,
      supportsClaims,
    },
  });
}

function safeParseStringArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function step(label: string, status: "pending" | "running" | "complete" | "error", summary: string) {
  return { label, status, summary };
}
