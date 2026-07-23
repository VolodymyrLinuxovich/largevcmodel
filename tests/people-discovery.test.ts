import { describe, expect, it } from "vitest";
import { EntityResolutionOutcome, PersonType, type DiscoveredPerson, type StartupProfile } from "@prisma/client";
import { resolveIncomingPerson } from "@/lib/people/entity-resolution";
import { EXTERNAL_DISCOVERY_UNAVAILABLE_MESSAGE } from "@/lib/people/search";
import { interpretPeopleSearchObjective } from "@/lib/people/query";
import { calculatePeopleFitScore } from "@/lib/people/scoring";
import { semanticSimilarity } from "@/lib/people/semantic";
import { extractStartupFields } from "@/lib/startups/pitch-deck";
import { OpenAIPeopleDiscoveryProvider } from "@/lib/people/openai";

describe("external people discovery architecture", () => {
  it("interprets people-search objectives without forcing an investor template", () => {
    const criteria = interpretPeopleSearchObjective({
      query: "Researchers working on battlefield AI and geospatial intelligence in Europe",
    });

    expect(criteria.personTypes).toContain(PersonType.RESEARCHER);
    expect(criteria.technologyKeywords.join(" ")).toContain("battlefield AI");
    expect(criteria.locations).toContain("Europe");
    expect(criteria.stages).toHaveLength(0);
    expect(criteria.checkSizeMin).toBeUndefined();
  });

  it("keeps provider-unavailable behavior explicit instead of allowing Gmail-only fallback", () => {
    expect(EXTERNAL_DISCOVERY_UNAVAILABLE_MESSAGE).toBe(
      "External people discovery is not configured. Gmail and Google Contacts can enrich known candidates, but they cannot be used as the primary discovery source.",
    );
  });

  it("reports OpenAI provider unavailable without an API key", async () => {
    const status = await new OpenAIPeopleDiscoveryProvider({}).status();
    expect(status.status).toBe("UNAVAILABLE");
    expect(status.message).toContain("OPENAI_API_KEY");
  });

  it("refuses to merge people on name alone", () => {
    const result = resolveIncomingPerson(
      {
        fullName: "Alex Morgan",
        currentOrganizationName: "Frontier Fund",
        sources: [],
        claims: [],
      },
      [
        {
          id: "existing",
          fullName: "Alex Morgan",
          currentOrganizationName: null,
          organizationDomain: null,
          linkedinUrl: null,
          emailAddresses: [],
          normalizedFingerprint: null,
        },
      ],
    );

    expect(result.outcome).toBe(EntityResolutionOutcome.UNCERTAIN_MATCH);
    expect(result.canonicalPersonId).toBeUndefined();
    expect(result.signals).toContain("Name-only match refused");
  });

  it("uses semantic similarity for adjacent defense/autonomy language", () => {
    const similarity = semanticSimilarity(
      "battlefield AI and autonomous defense systems",
      "dual-use robotics, national-security software, unmanned platforms, and defense technology",
    );

    expect(similarity).toBeGreaterThan(0.25);
  });

  it("adjusts fit scoring by person type and keeps relationship contribution separate", () => {
    const startup = startupFixture();
    const investor = personFixture({ personTypes: [PersonType.INVESTOR], preferredStages: ["seed"], minCheckSize: 250_000, maxCheckSize: 2_000_000 });
    const operator = personFixture({
      personTypes: [PersonType.OPERATOR],
      currentTitle: "VP Autonomy",
      preferredStages: [],
      minCheckSize: null,
      maxCheckSize: null,
      notableExperience: "Built autonomous robotics systems for national-security customers.",
      technologies: ["robotics", "autonomy", "defense AI"],
    });

    const investorScore = calculatePeopleFitScore({ startup, person: investor });
    const operatorScore = calculatePeopleFitScore({ startup, person: operator });

    expect(investorScore.components.find((component) => component.key === "checkSize")?.weight).toBeGreaterThan(0);
    expect(operatorScore.components.find((component) => component.key === "checkSize")?.weight).toBe(0);
    expect(operatorScore.components.find((component) => component.key === "portfolio")?.weight).toBeGreaterThan(
      investorScore.components.find((component) => component.key === "portfolio")?.weight ?? 0,
    );
  });

  it("extracts pitch-deck fields conservatively without fabricating absent facts", () => {
    const fields = extractStartupFields(
      "Product: autonomous sensor fusion for field teams. Industry: defense technology. Raising $1.5M. Team: ex robotics engineers.",
    );
    const keys = fields.map((field) => field.fieldKey);

    expect(keys).toEqual(expect.arrayContaining(["product", "industry", "fundingTarget", "team"]));
    expect(keys).not.toContain("customerCount");
  });
});

function startupFixture(): StartupProfile {
  return {
    id: "startup",
    userId: "user",
    name: "Sentinel Systems",
    website: null,
    logoUrl: null,
    oneLineDescription: "Defense AI for autonomous field operations",
    description: "Autonomy software for geospatial intelligence and unmanned systems.",
    industry: "defense technology",
    subIndustries: ["autonomy", "geospatial intelligence"],
    product: "AI autonomy platform",
    problem: "Field teams lack real-time autonomy support.",
    solution: "Sensor fusion and decision support.",
    targetCustomers: "Defense and public-sector operators",
    customerSegments: ["defense", "public sector"],
    businessModel: null,
    revenueModel: null,
    fundingStage: "seed",
    fundingTarget: 1_500_000,
    minCheckSize: 250_000,
    maxCheckSize: 2_000_000,
    headquarters: "San Francisco",
    targetGeographies: ["United States", "Europe"],
    traction: null,
    revenue: null,
    growthMetrics: null,
    customerCount: null,
    pilots: null,
    partnerships: null,
    team: "Robotics and defense software engineers",
    founderBackgrounds: "Autonomy and geospatial systems",
    keywords: ["defense AI", "autonomy"],
    technologies: ["robotics", "geospatial intelligence"],
    moat: null,
    competitors: [],
    preferredInvestorTypes: ["seed investor"],
    excludedInvestors: [],
    excludedOrganizations: [],
    fundraisingStatus: null,
    fundraisingTimeline: null,
    customNotes: null,
    searchCriteria: null,
    profileCompleteness: 80,
    isActive: true,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  };
}

function personFixture(overrides: Partial<DiscoveredPerson>): DiscoveredPerson {
  return {
    id: "person",
    userId: "user",
    provider: "test",
    providerPersonId: "provider-person",
    fullName: "Jordan Lee",
    firstName: "Jordan",
    lastName: "Lee",
    currentTitle: "Partner",
    currentOrganizationId: null,
    currentOrganizationName: "Frontier Fund",
    previousOrganizations: [],
    personTypes: [PersonType.INVESTOR],
    location: "San Francisco",
    biography: "Invests in defense AI, autonomy, robotics, and geospatial intelligence.",
    investmentThesis: "Seed-stage dual-use and national-security software.",
    industries: ["defense technology", "AI"],
    subIndustries: ["robotics", "autonomy"],
    preferredStages: ["seed"],
    minCheckSize: 250_000,
    maxCheckSize: 2_000_000,
    geographyPreferences: ["United States", "Europe"],
    portfolioCompanies: ["Autonomy Robotics"],
    notableInvestments: ["Geospatial AI Co"],
    notableExperience: "Defense software investing.",
    education: [],
    skills: [],
    keywords: ["dual-use", "national security"],
    technologies: ["autonomy", "robotics"],
    emailAddresses: [],
    organizationDomain: "frontier.example",
    linkedinUrl: null,
    xUrl: null,
    personalWebsite: null,
    publicProfileUrls: [],
    sourceConfidence: 86,
    fieldConfidence: null,
    conflictingClaims: null,
    searchText: "seed-stage defense AI autonomy robotics geospatial intelligence dual-use national-security software",
    normalizedFingerprint: "jordan lee|frontier fund",
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
