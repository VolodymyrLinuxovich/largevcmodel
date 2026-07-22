import { describe, expect, it } from "vitest";
import { calculateFitScore, DEFAULT_SCORING_WEIGHTS, normalizeWeights } from "@/lib/domain/scoring";

describe("fit scoring", () => {
  it("scores a Bay Area seed AI infrastructure founder highly", () => {
    const score = calculateFitScore({
      contactId: "contact-maya-chen",
      fullName: "Maya Chen",
      sector: "AI Infrastructure",
      stage: "Seed",
      location: "San Francisco, CA",
      relationshipStrength: 8,
      researchConfidence: 91,
      company: {
        sector: "AI Infrastructure",
        stage: "Seed",
        headquarters: "San Francisco, CA",
        latestFundingDate: "2026-05-14T00:00:00.000Z",
        latestFundingRound: "Seed",
        latestFundingAmount: "$3.2M",
        checkSizeFit: "$1.5M seed allocation",
      },
      sourceCount: 4,
      publicSourceCount: 3,
      supportedClaimCount: 7,
      citationSourceIds: ["source-vectorforge-seed", "source-vectorforge-product"],
    });

    expect(score.overall).toBeGreaterThanOrEqual(88);
    expect(score.citations).toEqual(["source-vectorforge-seed", "source-vectorforge-product"]);
  });

  it("normalizes non-100 weights", () => {
    const weights = normalizeWeights({ ...DEFAULT_SCORING_WEIGHTS, thesisMatch: 60 });
    const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
    expect(total).toBe(100);
  });
});
