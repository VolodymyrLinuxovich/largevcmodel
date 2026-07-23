import "server-only";

import {
  PeopleSearchStatus,
  PersonDiscoveryType,
  Prisma,
  ProviderHealthStatus,
  type DiscoveredPerson,
  type PersonRelationshipEnrichment,
  type PrismaClient,
  type StartupProfile,
} from "@prisma/client";
import { audit } from "@/lib/audit";
import { loadStartupProfile } from "@/lib/startups/profile";
import { getConfiguredPeopleDiscoveryProvider, getPeopleDiscoveryProviderStatus } from "./provider";
import { interpretPeopleSearchObjective } from "./query";
import { enrichPersonRelationship } from "./relationship";
import { calculatePeopleFitScore, type PeopleFitScore } from "./scoring";
import { embedTextLocally, fullTextScore, semanticSimilarity } from "./semantic";
import { persistProviderOrganization, persistProviderPerson, personSearchText } from "./normalization";
import { peopleSearchRequestSchema, type InterpretedPeopleCriteria, type PeopleSearchRequest } from "./types";

export const EXTERNAL_DISCOVERY_UNAVAILABLE_MESSAGE =
  "External people discovery is not configured. Gmail and Google Contacts can enrich known candidates, but they cannot be used as the primary discovery source.";

export type PeopleSearchResponse = {
  interpretedCriteria: InterpretedPeopleCriteria;
  results: PeopleSearchResultDto[];
  providerStatus: { name: string; status: ProviderHealthStatus; message: string };
  total: number;
  searchRunId: string;
  emptyReasons: string[];
};

export type PeopleSearchResultDto = {
  id: string;
  rank: number;
  person: {
    id: string;
    fullName: string;
    title?: string | null;
    organization?: string | null;
    location?: string | null;
    personTypes: string[];
    linkedinUrl?: string | null;
    websiteUrl?: string | null;
  };
  organization?: {
    id: string;
    name: string;
    domain?: string | null;
    website?: string | null;
  } | null;
  fitScore: number;
  scoreComponents: PeopleFitScore["components"];
  confidence: number;
  explanation: string;
  matchedCriteria: PeopleFitScore["matchedCriteria"];
  missingCriteria: PeopleFitScore["missingCriteria"];
  uncertainCriteria: PeopleFitScore["uncertainCriteria"];
  relationship: {
    directEmailHistory: boolean;
    googleContactPresent: boolean;
    gmailThreadCount: number;
    messageCount: number;
    mostRecentInteraction?: string | null;
    relationshipStrength: number;
    summary: string;
  };
  sources: Array<{
    id: string;
    title: string;
    url: string;
    publisher?: string | null;
    publishedAt?: string | null;
    sourceType: string;
    supportsClaims: string[];
    confidence?: number | null;
  }>;
  discoveryType: PersonDiscoveryType;
  savedState: { saved: boolean; lists: Array<{ id: string; name: string; status: string }> };
  lastResearchedAt: string;
};

type PersonWithRelations = DiscoveredPerson & {
  currentOrganization?: { id: string; name: string; domain: string | null; website: string | null } | null;
  relationshipEnrichments: PersonRelationshipEnrichment[];
  sources: Array<{
    id: string;
    title: string;
    url: string;
    publisher: string | null;
    publishedAt: Date | null;
    sourceType: string;
    supportsClaims: string[];
    confidence: number | null;
  }>;
  savedPeople: Array<{ list: { id: string; name: string }; status: string }>;
};

export async function searchPeople(prisma: PrismaClient, userId: string, rawInput: PeopleSearchRequest): Promise<PeopleSearchResponse> {
  const input = peopleSearchRequestSchema.parse(rawInput);
  const requestedStartup = input.startupId ? await loadStartupProfile(prisma, userId, input.startupId) : null;
  if (input.startupId && !requestedStartup) throw new Error("Startup profile not found.");
  const defaultStartup = input.startupId ? null : await loadStartupProfile(prisma, userId);
  const savedStartup = requestedStartup ?? defaultStartup;

  const interpretedCriteria = interpretPeopleSearchObjective({
    query: input.query,
    filters: input.filters,
    startupCriteria: savedStartup?.searchCriteria ?? null,
  });
  const startup = savedStartup ?? searchOnlyStartupContext(userId, input, interpretedCriteria);
  const initialProviderStatus = await getPeopleDiscoveryProviderStatus();
  const run = await prisma.peopleSearchRun.create({
    data: {
      userId,
      startupId: savedStartup?.id ?? null,
      query: input.query,
      interpretedCriteria: interpretedCriteria as unknown as Prisma.InputJsonObject,
      filters: input.filters as unknown as Prisma.InputJsonObject,
      provider: initialProviderStatus.name,
      providerStatus: initialProviderStatus.status,
      status: initialProviderStatus.status === ProviderHealthStatus.UNAVAILABLE ? PeopleSearchStatus.UNAVAILABLE : PeopleSearchStatus.RUNNING,
      error: initialProviderStatus.status === ProviderHealthStatus.UNAVAILABLE ? EXTERNAL_DISCOVERY_UNAVAILABLE_MESSAGE : null,
    },
  });

  await audit(prisma, {
    userId,
    actor: "People discovery",
    action: "People search started",
    outcome: "running",
    dataSource: "External research provider",
    details: input.query,
    metadata: { startupId: savedStartup?.id ?? null, provider: initialProviderStatus.name },
  });

  const provider = getConfiguredPeopleDiscoveryProvider();
  if (!provider || initialProviderStatus.status === ProviderHealthStatus.UNAVAILABLE) {
    await prisma.peopleSearchRun.update({
      where: { id: run.id },
      data: {
        status: PeopleSearchStatus.UNAVAILABLE,
        completedAt: new Date(),
        error: EXTERNAL_DISCOVERY_UNAVAILABLE_MESSAGE,
      },
    });
    return {
      interpretedCriteria,
      results: [],
      providerStatus: {
        name: initialProviderStatus.name,
        status: ProviderHealthStatus.UNAVAILABLE,
        message: EXTERNAL_DISCOVERY_UNAVAILABLE_MESSAGE,
      },
      total: 0,
      searchRunId: run.id,
      emptyReasons: [
        EXTERNAL_DISCOVERY_UNAVAILABLE_MESSAGE,
        "No Gmail or Google Contacts records were used as replacement candidates.",
      ],
    };
  }

  const providerResult = await provider.searchPeople({
    query: input.query,
    interpreted: interpretedCriteria,
    startup: startupSnapshot(startup),
    limit: Math.min(80, Math.max(input.limit * 3, input.limit)),
  });

  await prisma.peopleSearchRun.update({
    where: { id: run.id },
    data: {
      provider: providerResult.provider,
      providerStatus: providerResult.status.status,
      providerLatencyMs: providerResult.latencyMs,
      candidateCount: providerResult.people.length,
      status:
        providerResult.status.status === ProviderHealthStatus.CONFIGURED || providerResult.status.status === ProviderHealthStatus.DEGRADED
          ? PeopleSearchStatus.RUNNING
          : PeopleSearchStatus.ERROR,
      error: providerResult.error ?? null,
    },
  });

  if (
    providerResult.status.status !== ProviderHealthStatus.CONFIGURED &&
    providerResult.status.status !== ProviderHealthStatus.DEGRADED &&
    providerResult.people.length === 0
  ) {
    await prisma.peopleSearchRun.update({
      where: { id: run.id },
      data: { status: PeopleSearchStatus.ERROR, completedAt: new Date(), error: providerResult.status.message },
    });
    return {
      interpretedCriteria,
      results: [],
      providerStatus: providerResult.status,
      total: 0,
      searchRunId: run.id,
      emptyReasons: [
        providerResult.status.message,
        "The provider did not return supported external people. Gmail and Google Contacts were not used as fallback discovery sources.",
      ],
    };
  }

  for (const organization of providerResult.organizations) {
    await persistProviderOrganization(prisma, userId, providerResult.provider, organization);
  }

  const persistedIds: string[] = [];
  await upsertEmbedding(
    prisma,
    userId,
    savedStartup ? "startup_profile" : "search_context",
    savedStartup?.id ?? run.id,
    JSON.stringify(startupSnapshot(startup)),
  );
  for (const candidate of providerResult.people) {
    const saved = await persistProviderPerson(prisma, userId, providerResult.provider, candidate);
    if (saved) persistedIds.push(saved.id);
  }
  const uniqueIds = Array.from(new Set(persistedIds));
  const people = uniqueIds.length
    ? await prisma.discoveredPerson.findMany({
        where: { userId, id: { in: uniqueIds } },
        include: {
          currentOrganization: { select: { id: true, name: true, domain: true, website: true } },
          relationshipEnrichments: { where: { userId }, take: 1 },
          sources: true,
          savedPeople: { where: { userId }, include: { list: { select: { id: true, name: true } } } },
        },
      })
    : [];

  const scored: Array<{ person: PersonWithRelations; relationship: PersonRelationshipEnrichment; fit: PeopleFitScore; relevance: number }> = [];
  for (const person of people as PersonWithRelations[]) {
    await upsertEmbedding(prisma, userId, "discovered_person", person.id, person.searchText || personSearchText(person));
    const relationship = await enrichPersonRelationship(prisma, userId, person);
    if (!passesStructuredFilters(person, relationship, startup, interpretedCriteria, input.filters)) continue;
    const fit = calculatePeopleFitScore({ startup, person, relationship, interpretedCriteria });
    const relevance = combinedRelevance(input.query, startup, person, fit);
    if (relevance < 20 && fit.overall < 25) continue;
    scored.push({ person, relationship, fit, relevance });
  }

  const ranked = scored
    .sort((left, right) => sortValue(right, interpretedCriteria) - sortValue(left, interpretedCriteria))
    .slice(input.offset, input.offset + input.limit);

  const dtos: PeopleSearchResultDto[] = [];
  let rank = input.offset + 1;
  for (const item of ranked) {
    const savedResult = await persistSearchResult(prisma, userId, run.id, item.person, item.relationship, item.fit, rank);
    dtos.push(toDto(savedResult.id, rank, item.person, item.relationship, item.fit));
    rank += 1;
  }

  await prisma.peopleSearchRun.update({
    where: { id: run.id },
    data: {
      status: providerResult.partial ? PeopleSearchStatus.PARTIAL : PeopleSearchStatus.COMPLETED,
      total: scored.length,
      normalizedCount: uniqueIds.length,
      dedupedCount: people.length,
      filteredCount: scored.length,
      rankedCount: dtos.length,
      completedAt: new Date(),
    },
  });
  await audit(prisma, {
    userId,
    actor: "People discovery",
    action: "People search completed",
    outcome: providerResult.partial ? "partial" : "completed",
    dataSource: providerResult.provider,
    details: `${providerResult.people.length} external candidates returned; ${dtos.length} ranked results persisted.`,
    metadata: {
      searchRunId: run.id,
      candidateCount: providerResult.people.length,
      normalizedCount: uniqueIds.length,
      rankedCount: dtos.length,
      providerLatencyMs: providerResult.latencyMs,
    },
  });

  return {
    interpretedCriteria,
    results: dtos,
    providerStatus: providerResult.status,
    total: scored.length,
    searchRunId: run.id,
    emptyReasons: dtos.length
      ? []
      : [
          "No sufficiently supported external people matched this search.",
          "The configured provider returned no candidates above the relevance threshold, or filters were too restrictive.",
        ],
  };
}

async function upsertEmbedding(prisma: PrismaClient, userId: string, entityType: string, entityId: string, content: string) {
  const embedding = embedTextLocally(content);
  await prisma.personEmbedding.upsert({
    where: { userId_entityType_entityId_model: { userId, entityType, entityId, model: embedding.model } },
    create: {
      userId,
      entityType,
      entityId,
      model: embedding.model,
      dimensions: embedding.dimensions,
      vector: embedding.vector,
      sourceContentHash: embedding.sourceContentHash,
      stale: false,
    },
    update: {
      dimensions: embedding.dimensions,
      vector: embedding.vector,
      sourceContentHash: embedding.sourceContentHash,
      generatedAt: new Date(),
      stale: false,
    },
  });
}

export function searchOnlyStartupContext(userId: string, input: PeopleSearchRequest, interpreted: InterpretedPeopleCriteria): StartupProfile {
  const now = new Date();
  const industry = input.filters.industries[0] ?? interpreted.industries[0] ?? null;
  const targetGeographies = uniqueStrings([...input.filters.locations, ...interpreted.locations, ...interpreted.geographyPreferences]);
  const technologies = uniqueStrings([...input.filters.technologyKeywords, ...interpreted.technologyKeywords]);
  const keywords = uniqueStrings([
    ...input.filters.portfolioKeywords,
    ...interpreted.portfolioKeywords,
    ...interpreted.industries,
    ...interpreted.titles,
  ]);

  return {
    id: "search-context",
    userId,
    name: "Search criteria",
    website: null,
    logoUrl: null,
    oneLineDescription: input.query,
    description: input.query,
    industry,
    subIndustries: uniqueStrings([...input.filters.subIndustries, ...interpreted.industries]),
    product: input.query,
    problem: null,
    solution: null,
    targetCustomers: null,
    customerSegments: [],
    businessModel: null,
    revenueModel: null,
    fundingStage: input.filters.stages[0] ?? interpreted.stages[0] ?? null,
    fundingTarget: null,
    minCheckSize: input.filters.minCheckSize ?? interpreted.checkSizeMin ?? null,
    maxCheckSize: input.filters.maxCheckSize ?? interpreted.checkSizeMax ?? null,
    headquarters: null,
    targetGeographies,
    traction: null,
    revenue: null,
    growthMetrics: null,
    customerCount: null,
    pilots: null,
    partnerships: null,
    team: null,
    founderBackgrounds: null,
    keywords,
    technologies,
    moat: null,
    competitors: [],
    preferredInvestorTypes: interpreted.personTypes.map((type) => type.toLowerCase().replaceAll("_", " ")),
    excludedInvestors: [],
    excludedOrganizations: interpreted.excludedTerms,
    fundraisingStatus: null,
    fundraisingTimeline: null,
    customNotes: null,
    searchCriteria: null,
    profileCompleteness: 0,
    isActive: false,
    createdAt: now,
    updatedAt: now,
  };
}

function startupSnapshot(startup: StartupProfile) {
  return {
    id: startup.id,
    name: startup.name,
    website: startup.website,
    oneLineDescription: startup.oneLineDescription,
    description: startup.description,
    industry: startup.industry,
    subIndustries: startup.subIndustries,
    product: startup.product,
    problem: startup.problem,
    solution: startup.solution,
    targetCustomers: startup.targetCustomers,
    fundingStage: startup.fundingStage,
    fundingTarget: startup.fundingTarget,
    minCheckSize: startup.minCheckSize,
    maxCheckSize: startup.maxCheckSize,
    targetGeographies: startup.targetGeographies,
    technologies: startup.technologies,
    keywords: startup.keywords,
    preferredInvestorTypes: startup.preferredInvestorTypes,
    excludedInvestors: startup.excludedInvestors,
    excludedOrganizations: startup.excludedOrganizations,
    searchCriteria: startup.searchCriteria,
  };
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function passesStructuredFilters(
  person: DiscoveredPerson,
  relationship: PersonRelationshipEnrichment,
  startup: StartupProfile,
  interpreted: InterpretedPeopleCriteria,
  filters: PeopleSearchRequest["filters"],
) {
  const doc = personSearchText(person).toLowerCase();
  const excluded = [...interpreted.excludedTerms, ...startup.excludedInvestors, ...startup.excludedOrganizations].map((value) => value.toLowerCase());
  if (excluded.some((term) => term && doc.includes(term))) return false;

  const requiredTypes = filters.personTypes.length ? filters.personTypes : interpreted.personTypes;
  if (requiredTypes.length && !person.personTypes.some((type) => requiredTypes.includes(type))) return false;
  if (filters.minSourceConfidence && (person.sourceConfidence ?? 0) < filters.minSourceConfidence) return false;
  if (filters.googleContactPresence === "present" && !relationship.googleContactPresent) return false;
  if (filters.googleContactPresence === "absent" && relationship.googleContactPresent) return false;
  if (filters.directGmailHistory === "present" && !relationship.directEmailHistory) return false;
  if (filters.directGmailHistory === "absent" && relationship.directEmailHistory) return false;
  if (filters.relationshipStatus === "known" && relationship.relationshipStrength <= 0) return false;
  if (filters.relationshipStatus === "unknown" && relationship.relationshipStrength > 0) return false;
  if (filters.relationshipStatus === "warm" && relationship.relationshipStrength < 45) return false;
  if (filters.warmIntroductionAvailable === true && relationship.relationshipStrength < 45) return false;

  const containsAny = (needles: string[], haystack: string[]) => !needles.length || needles.some((needle) => haystack.join(" ").toLowerCase().includes(needle.toLowerCase()));
  if (!containsAny(filters.industries, [...person.industries, ...person.subIndustries])) return false;
  if (!containsAny(filters.stages, person.preferredStages)) return false;
  if (!containsAny(filters.locations, [person.location ?? "", ...person.geographyPreferences])) return false;
  if (!containsAny(filters.organizations, [person.currentOrganizationName ?? "", ...person.previousOrganizations])) return false;
  if (!containsAny(filters.titles, [person.currentTitle ?? ""])) return false;
  if (!containsAny(filters.technologyKeywords, [...person.technologies, ...person.keywords, person.biography ?? ""])) return false;
  if (!containsAny(filters.portfolioKeywords, [...person.portfolioCompanies, ...person.notableInvestments, person.notableExperience ?? ""])) return false;
  if (filters.minCheckSize && person.maxCheckSize && person.maxCheckSize < filters.minCheckSize) return false;
  if (filters.maxCheckSize && person.minCheckSize && person.minCheckSize > filters.maxCheckSize) return false;
  return true;
}

function combinedRelevance(query: string, startup: StartupProfile, person: DiscoveredPerson, fit: PeopleFitScore) {
  const document = person.searchText || personSearchText(person);
  const startupText = startupSnapshot(startup);
  const semantic = semanticSimilarity(query, document) * 100;
  const fullText = fullTextScore(query, document) * 100;
  const startupSimilarity = semanticSimilarity(JSON.stringify(startupText), document) * 100;
  return Math.round(Math.max(fullText, semantic) * 0.45 + startupSimilarity * 0.2 + fit.overall * 0.35);
}

function sortValue(item: { fit: PeopleFitScore; relationship: PersonRelationshipEnrichment; person: DiscoveredPerson; relevance: number }, interpreted: InterpretedPeopleCriteria) {
  if (interpreted.sortPreference === "relationship") return item.relationship.relationshipStrength * 0.7 + item.fit.overall * 0.3;
  if (interpreted.sortPreference === "recency") return (item.person.lastResearchedAt.getTime() / 1_000_000_000) + item.fit.overall;
  return item.relevance * 0.25 + item.fit.overall * 0.7 + item.fit.confidence * 0.05;
}

async function persistSearchResult(
  prisma: PrismaClient,
  userId: string,
  searchRunId: string,
  person: PersonWithRelations,
  relationship: PersonRelationshipEnrichment,
  fit: PeopleFitScore,
  rank: number,
) {
  await prisma.personFitScore.create({
    data: {
      userId,
      startupId: (await prisma.peopleSearchRun.findUniqueOrThrow({ where: { id: searchRunId }, select: { startupId: true } })).startupId,
      personId: person.id,
      overall: fit.overall,
      confidence: fit.confidence,
      components: fit.components as unknown as Prisma.InputJsonArray,
      explanation: fit.explanation,
      matchedCriteria: fit.matchedCriteria as unknown as Prisma.InputJsonArray,
      missingCriteria: fit.missingCriteria as unknown as Prisma.InputJsonArray,
      uncertainCriteria: fit.uncertainCriteria as unknown as Prisma.InputJsonArray,
      sourceCoverage: fit.sourceCoverage as Prisma.InputJsonObject,
      relationshipContribution: fit.relationshipContribution,
      modelVersion: "startup-fit-v1",
    },
  });
  return prisma.peopleSearchResult.upsert({
    where: { searchRunId_personId: { searchRunId, personId: person.id } },
    create: {
      userId,
      searchRunId,
      personId: person.id,
      organizationId: person.currentOrganization?.id ?? null,
      rank,
      score: fit.overall,
      confidence: fit.confidence,
      explanation: fit.explanation,
      matchedCriteria: fit.matchedCriteria as unknown as Prisma.InputJsonArray,
      missingCriteria: fit.missingCriteria as unknown as Prisma.InputJsonArray,
      uncertainCriteria: fit.uncertainCriteria as unknown as Prisma.InputJsonArray,
      relationship: relationshipSnapshot(relationship) as Prisma.InputJsonObject,
      sourcesSnapshot: sourceSnapshot(person) as unknown as Prisma.InputJsonArray,
      discoveryType: PersonDiscoveryType.EXTERNALLY_DISCOVERED,
      savedSnapshot: savedSnapshot(person) as unknown as Prisma.InputJsonObject,
    },
    update: {
      rank,
      score: fit.overall,
      confidence: fit.confidence,
      explanation: fit.explanation,
      matchedCriteria: fit.matchedCriteria as unknown as Prisma.InputJsonArray,
      missingCriteria: fit.missingCriteria as unknown as Prisma.InputJsonArray,
      uncertainCriteria: fit.uncertainCriteria as unknown as Prisma.InputJsonArray,
      relationship: relationshipSnapshot(relationship) as Prisma.InputJsonObject,
      sourcesSnapshot: sourceSnapshot(person) as unknown as Prisma.InputJsonArray,
      savedSnapshot: savedSnapshot(person) as unknown as Prisma.InputJsonObject,
    },
  });
}

function toDto(
  resultId: string,
  rank: number,
  person: PersonWithRelations,
  relationship: PersonRelationshipEnrichment,
  fit: PeopleFitScore,
): PeopleSearchResultDto {
  return {
    id: resultId,
    rank,
    person: {
      id: person.id,
      fullName: person.fullName,
      title: person.currentTitle,
      organization: person.currentOrganizationName,
      location: person.location,
      personTypes: person.personTypes,
      linkedinUrl: person.linkedinUrl,
      websiteUrl: person.personalWebsite,
    },
    organization: person.currentOrganization
      ? {
          id: person.currentOrganization.id,
          name: person.currentOrganization.name,
          domain: person.currentOrganization.domain,
          website: person.currentOrganization.website,
        }
      : null,
    fitScore: fit.overall,
    scoreComponents: fit.components,
    confidence: fit.confidence,
    explanation: fit.explanation,
    matchedCriteria: fit.matchedCriteria,
    missingCriteria: fit.missingCriteria,
    uncertainCriteria: fit.uncertainCriteria,
    relationship: relationshipSnapshot(relationship),
    sources: sourceSnapshot(person),
    discoveryType: PersonDiscoveryType.EXTERNALLY_DISCOVERED,
    savedState: savedSnapshot(person),
    lastResearchedAt: person.lastResearchedAt.toISOString(),
  };
}

function relationshipSnapshot(relationship: PersonRelationshipEnrichment) {
  const parts = [];
  if (relationship.gmailThreadCount) parts.push(`${relationship.gmailThreadCount} Gmail thread${relationship.gmailThreadCount === 1 ? "" : "s"}`);
  if (relationship.googleContactPresent) parts.push("Google Contact");
  if (!parts.length) parts.push("No known relationship");
  return {
    directEmailHistory: relationship.directEmailHistory,
    googleContactPresent: relationship.googleContactPresent,
    gmailThreadCount: relationship.gmailThreadCount,
    messageCount: relationship.messageCount,
    mostRecentInteraction: relationship.mostRecentInteraction?.toISOString() ?? null,
    relationshipStrength: relationship.relationshipStrength,
    summary: parts.join(" / "),
  };
}

function sourceSnapshot(person: PersonWithRelations) {
  return person.sources.map((source) => ({
    id: source.id,
    title: source.title,
    url: source.url,
    publisher: source.publisher,
    publishedAt: source.publishedAt?.toISOString() ?? null,
    sourceType: source.sourceType,
    supportsClaims: source.supportsClaims,
    confidence: source.confidence,
  }));
}

function savedSnapshot(person: PersonWithRelations) {
  return {
    saved: person.savedPeople.length > 0,
    lists: person.savedPeople.map((saved) => ({ id: saved.list.id, name: saved.list.name, status: saved.status })),
  };
}
