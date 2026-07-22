import type { ResearchProvider } from "./provider";
import type { ResearchClaimInput, ResearchRequest, ResearchResult } from "@/lib/domain/types";
import { demoCompanies, demoContacts, demoSources, FIXED_ACCESS_DATE } from "@/lib/demo/fixtures";

export class MockResearchProvider implements ResearchProvider {
  async researchFounder(input: ResearchRequest): Promise<ResearchResult> {
    const contact = demoContacts.find((item) => item.id === input.contactId);
    const company = demoCompanies.find((item) => item.id === (input.companyId ?? contact?.companyId));

    if (!contact || !company) {
      return {
        provider: "mock",
        summary: "No mock research fixture was available for this founder.",
        sources: [],
        claims: [
          {
            text: "Public research fixture unavailable for this candidate.",
            category: "research",
            provenance: "unverified",
            confidence: 30,
            contactId: input.contactId,
            companyId: input.companyId,
          },
        ],
        unavailable: ["No seeded public source fixture found."],
        inferred: [],
      };
    }

    const relevantSources = demoSources.filter(
      (source) =>
        source.sourceType === "internal_crm" ||
        ("contactId" in source && source.contactId === contact.id) ||
        ("companyId" in source && source.companyId === company.id),
    );

    const sourceUrls = relevantSources.map((source) => source.url);
    const claims: ResearchClaimInput[] = [
      ...relevantSources.flatMap((source) =>
        source.supportsClaims.map((claim) => ({
          text: claim,
          category: source.sourceType,
          provenance: source.sourceType === "internal_crm" ? ("internal_crm" as const) : ("public_source" as const),
          confidence: source.sourceType === "internal_crm" ? 100 : 84,
          contactId: contact.id,
          companyId: company.id,
          sourceUrls: [source.url],
        })),
      ),
      {
        text: `${contact.fullName} appears relevant to the fund thesis because ${company.sector.toLowerCase()} intersects with technical AI infrastructure, ${company.stage.toLowerCase()} stage, and ${company.headquarters} geography.`,
        category: "fit_inference",
        provenance: "ai_inference" as const,
        confidence: 76,
        contactId: contact.id,
        companyId: company.id,
        sourceUrls,
      },
    ];

    const unavailable =
      company.stage === "Seed" && company.latestFundingDate
        ? []
        : ["Recent seed-round status is unavailable or does not match the requested filter exactly."];
    if (unavailable.length) {
      claims.push({
        text: "The requested recent seed-round condition is not fully verified for this candidate.",
        category: "funding_verification",
        provenance: "unverified",
        confidence: 35,
        contactId: contact.id,
        companyId: company.id,
        sourceUrls: [],
      });
    }

    return {
      provider: "mock",
      summary: `Mock Hermes research assembled ${relevantSources.length} demo sources for ${contact.fullName} at ${company.name}. Accessed ${FIXED_ACCESS_DATE}.`,
      sources: relevantSources,
      claims,
      unavailable,
      inferred: [
        "Fit, timing, and outreach relevance are model-generated conclusions derived from available demo evidence.",
      ],
    };
  }
}
