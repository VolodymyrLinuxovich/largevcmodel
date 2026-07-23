import { describe, expect, it } from "vitest";
import { PersonType, type DiscoveredPerson, type PersonRelationshipEnrichment } from "@prisma/client";
import { buildPeopleResearchQueries, parsePeopleDiscoveryJsonForTest, summarizeOpenAIResponseForTest } from "@/lib/people/openai";
import { interpretPeopleSearchObjective } from "@/lib/people/query";
import { calculatePeopleFitScore } from "@/lib/people/scoring";
import { evaluateHardFilters, searchOnlyStartupContext } from "@/lib/people/search";
import { expandGeographyTerms, expandIndustryTerms, expandStageTerms, matchesAnyExpanded } from "@/lib/people/search-taxonomy";
import { peopleSearchFiltersSchema, peopleSearchRequestSchema, type PeopleProviderSearchInput } from "@/lib/people/types";

describe("external people search pipeline", () => {
  it("splits comma-separated industries before filtering", () => {
    const filters = peopleSearchFiltersSchema.parse({ industries: ["Miltech, AI"] });

    expect(filters.industries).toEqual(["Miltech", "AI"]);
  });

  it("matches miltech and AI aliases without literal exact wording", () => {
    expect(matchesAnyExpanded(["Miltech"], ["defense technology"], expandIndustryTerms)).toBe(true);
    expect(matchesAnyExpanded(["AI"], ["autonomy"], expandIndustryTerms)).toBe(true);
  });

  it("expands Europe geography to European countries and cities", () => {
    expect(matchesAnyExpanded(["Europe"], ["London"], expandGeographyTerms)).toBe(true);
    expect(matchesAnyExpanded(["Europe"], ["Germany"], expandGeographyTerms)).toBe(true);
  });

  it("treats Seed as compatible with early-stage terminology", () => {
    expect(matchesAnyExpanded(["Seed"], ["early stage"], expandStageTerms)).toBe(true);
    expect(matchesAnyExpanded(["Seed"], ["pre-Series A"], expandStageTerms)).toBe(true);
  });

  it("does not let relationship Any filter external candidates", () => {
    const input = screenshotSearchInput();
    const startup = searchOnlyStartupContext("user", input, interpretPeopleSearchObjective({ query: input.query, filters: input.filters }));
    const candidate = discoveredInvestor({ preferredStages: ["early stage"], industries: ["defense technology"], location: "London" });

    expect(evaluateHardFilters(candidate, emptyRelationship(), startup, input.interpreted, input.filters)).toMatchObject({ eligible: true });
  });

  it("allows external search without a saved startup profile", () => {
    const parsed = peopleSearchRequestSchema.parse({
      query: "Find and rank defense-tech investors in Europe",
      filters: { personTypes: [PersonType.INVESTOR], industries: "Miltech, AI", locations: "Europe" },
    });
    const interpreted = interpretPeopleSearchObjective({ query: parsed.query, filters: parsed.filters });
    const startup = searchOnlyStartupContext("user", parsed, interpreted);

    expect(startup.name).toBe("Search criteria");
    expect(startup.subIndustries.join(" ")).toContain("defense technology");
  });

  it("does not reject missing check size or missing personal thesis in compatible mode", () => {
    const input = screenshotSearchInput();
    const startup = searchOnlyStartupContext("user", input, input.interpreted);
    const candidate = discoveredInvestor({
      investmentThesis: null,
      minCheckSize: null,
      maxCheckSize: null,
      preferredStages: [],
      industries: ["defence tech"],
      location: "Berlin",
    });

    expect(evaluateHardFilters(candidate, emptyRelationship(), startup, input.interpreted, input.filters)).toMatchObject({ eligible: true });
  });

  it("parses valid provider candidates even when another candidate is malformed", () => {
    const input = providerInput();
    const parsed = parsePeopleDiscoveryJsonForTest({
      people: [
        { fullName: "", currentTitle: "Partner" },
        sourceBackedRawInvestor(),
      ],
    }, input);

    expect(parsed.values).toHaveLength(1);
    expect(parsed.values[0]?.fullName).toBe("Alice Morgan");
    expect(parsed.rejections.some((rejection) => rejection.reasons.includes("invalid_full_name"))).toBe(true);
  });

  it("marks provider diagnostics degraded when web search does not execute", () => {
    const diagnostics = summarizeOpenAIResponseForTest({ output: [{ type: "message", content: [{ text: "{}" }] }] });

    expect(diagnostics.webSearchExecuted).toBe(false);
    expect(diagnostics.webSearchCallCount).toBe(0);
  });

  it("returns source-backed partial candidates with unknown optional fields", () => {
    const parsed = parsePeopleDiscoveryJsonForTest({ people: [sourceBackedRawInvestor({ investmentThesis: null, minCheckSize: null, maxCheckSize: null })] }, providerInput());

    expect(parsed.values).toHaveLength(1);
    expect(parsed.values[0]?.sources[0]?.url).toContain("example.com");
    expect(parsed.values[0]?.investmentThesis).toBeNull();
    expect(parsed.values[0]?.minCheckSize).toBeNull();
  });

  it("removes unsupported factual claims instead of rejecting the whole candidate", () => {
    const parsed = parsePeopleDiscoveryJsonForTest({
      people: [
        sourceBackedRawInvestor({
          claims: [
            { text: "Supported role claim", sourceUrls: ["https://example.com/team"] },
            { text: "Unsupported check-size claim", sourceUrls: [] },
          ],
        }),
      ],
    }, providerInput());

    expect(parsed.values).toHaveLength(1);
    expect(parsed.values[0]?.claims.map((claim) => claim.text)).toEqual(["Supported role claim"]);
  });

  it("uses strict mode for exact hard filters", () => {
    const input = screenshotSearchInput({ matchMode: "strict" });
    const startup = searchOnlyStartupContext("user", input, input.interpreted);
    const candidate = discoveredInvestor({ industries: [], preferredStages: [], geographyPreferences: [], location: null });
    const result = evaluateHardFilters(candidate, emptyRelationship(), startup, input.interpreted, input.filters);

    expect(result.eligible).toBe(false);
    expect(result.reasons).toEqual(expect.arrayContaining(["industry_mismatch_unknown", "stage_mismatch_unknown", "geography_mismatch_unknown"]));
  });

  it("keeps a source-backed partial investor for the screenshot query and records unknowns in scoring", () => {
    const input = screenshotSearchInput();
    const startup = searchOnlyStartupContext("user", input, input.interpreted);
    const candidate = discoveredInvestor({
      industries: ["defense technology", "artificial intelligence"],
      preferredStages: ["early stage"],
      location: "London",
      geographyPreferences: ["Europe"],
      minCheckSize: null,
      maxCheckSize: null,
      investmentThesis: null,
    });
    const relationship = emptyRelationship();
    const eligibility = evaluateHardFilters(candidate, relationship, startup, input.interpreted, input.filters);
    const score = calculatePeopleFitScore({ startup, person: candidate, relationship, interpretedCriteria: input.interpreted });

    expect(eligibility.eligible).toBe(true);
    expect(score.overall).toBeGreaterThan(20);
    expect(score.missingCriteria.some((criterion) => criterion.criterion === "Check-size fit")).toBe(true);
  });

  it("generates multiple defense and dual-use research queries", () => {
    const queries = buildPeopleResearchQueries(providerInput());

    expect(queries.length).toBeGreaterThan(3);
    expect(queries.join(" ")).toContain("dual-use");
    expect(queries.join(" ")).toMatch(/defen[cs]e tech/);
  });
});

function screenshotSearchInput(overrides: Record<string, unknown> = {}) {
  const parsed = peopleSearchRequestSchema.parse({
    query: "Find and rank defense-tech investors whose portfolio, stage, check size, geography, and thesis closely match my startup, using external research rather than Gmail or contacts.",
    filters: {
      personTypes: [PersonType.INVESTOR],
      industries: "Miltech, AI",
      stages: "Seed",
      locations: "Europe",
      relationshipStatus: "any",
      ...overrides,
    },
  });
  const interpreted = interpretPeopleSearchObjective({ query: parsed.query, filters: parsed.filters });
  return { ...parsed, interpreted };
}

function providerInput(): PeopleProviderSearchInput {
  const input = screenshotSearchInput();
  return {
    query: input.query,
    interpreted: input.interpreted,
    startup: {
      id: "search-context",
      name: "Search criteria",
      website: null,
      oneLineDescription: input.query,
      description: input.query,
      industry: "Miltech",
      subIndustries: ["Miltech", "AI"],
      product: input.query,
      problem: null,
      solution: null,
      targetCustomers: null,
      fundingStage: "Seed",
      fundingTarget: null,
      minCheckSize: null,
      maxCheckSize: null,
      targetGeographies: ["Europe"],
      technologies: ["AI"],
      keywords: ["defense tech"],
      preferredInvestorTypes: ["investor"],
      excludedInvestors: [],
      excludedOrganizations: [],
      searchCriteria: null,
    },
    limit: 12,
  };
}

function sourceBackedRawInvestor(overrides: Record<string, unknown> = {}) {
  return {
    fullName: "Alice Morgan",
    currentTitle: "General Partner",
    currentOrganizationName: "Frontier Defence Ventures",
    personTypes: ["investor"],
    location: "London",
    industries: ["defence technology", "AI"],
    preferredStages: ["early stage"],
    publicProfileUrls: ["https://example.com/team"],
    sources: [{ title: "Team", url: "https://example.com/team", supportsClaims: ["Alice Morgan is General Partner"] }],
    claims: [{ text: "Alice Morgan is General Partner at Frontier Defence Ventures", sourceUrls: ["https://example.com/team"] }],
    ...overrides,
  };
}

function discoveredInvestor(overrides: Partial<DiscoveredPerson>): DiscoveredPerson {
  return {
    id: "person",
    userId: "user",
    provider: "test",
    providerPersonId: "provider",
    fullName: "Alice Morgan",
    firstName: "Alice",
    lastName: "Morgan",
    currentTitle: "General Partner",
    currentOrganizationId: null,
    currentOrganizationName: "Frontier Defence Ventures",
    previousOrganizations: [],
    personTypes: [PersonType.INVESTOR],
    location: "London",
    biography: "Invests in defense technology and artificial intelligence.",
    investmentThesis: "Early-stage defense and dual-use software.",
    industries: ["defense technology"],
    subIndustries: [],
    preferredStages: ["seed"],
    minCheckSize: null,
    maxCheckSize: null,
    geographyPreferences: ["Europe"],
    portfolioCompanies: ["Autonomy Systems"],
    notableInvestments: [],
    notableExperience: null,
    education: [],
    skills: [],
    keywords: ["dual-use"],
    technologies: ["AI"],
    emailAddresses: [],
    organizationDomain: "example.com",
    linkedinUrl: null,
    xUrl: null,
    personalWebsite: null,
    publicProfileUrls: ["https://example.com/team"],
    sourceConfidence: 84,
    fieldConfidence: null,
    conflictingClaims: null,
    searchText: "General Partner defense technology artificial intelligence Europe early stage seed dual-use",
    normalizedFingerprint: "alice morgan|frontier defence ventures",
    firstResearchedAt: new Date("2026-01-01"),
    lastResearchedAt: new Date("2026-01-01"),
    researchProvider: "test",
    manuallyAdded: false,
    externallyDiscovered: true,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

function emptyRelationship(): PersonRelationshipEnrichment {
  return {
    id: "relationship",
    userId: "user",
    personId: "person",
    contactId: null,
    directEmailHistory: false,
    gmailThreadCount: 0,
    messageCount: 0,
    mostRecentInteraction: null,
    firstInteraction: null,
    inboundOutboundBalance: null,
    googleContactPresent: false,
    savedContactOrg: null,
    knownAliases: [],
    relationshipStrength: 0,
    possibleIntroPath: null,
    evidence: null,
    confidence: 42,
    refreshedAt: new Date("2026-01-01"),
  };
}
