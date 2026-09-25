import { describe, expect, it } from "vitest";
import { calculateFitScore, DEFAULT_SCORING_WEIGHTS, normalizeWeights } from "@/lib/domain/scoring";

describe("fit scoring", () => {
  it("scores a well-supported contact higher than an unsupported contact", () => {
    const scored = calculateFitScore({
      contactId: "test-contact-1",
      fullName: "Test Contact",
      organization: "AI Infrastructure Company",
      title: "Founder",
      sector: "AI Infrastructure",
      stage: "Seed",
      geography: "San Francisco",
      relationshipStrength: 80,
      interactionCount: 6,
      lastInteractionAt: new Date().toISOString(),
      sourceCount: 4,
      supportedClaimCount: 6,
      thesis: {
        targetSectors: ["AI Infrastructure"],
        stages: ["Seed"],
        geographies: ["San Francisco"],
      },
    });

    const unsupported = calculateFitScore({
      contactId: "test-contact-2",
      fullName: "Unverified Contact",
      sourceCount: 0,
      supportedClaimCount: 0,
      thesis: {
        targetSectors: ["AI Infrastructure"],
        stages: ["Seed"],
        geographies: ["San Francisco"],
      },
    });

    expect(scored.overall).toBeGreaterThan(unsupported.overall);
    expect(scored.confidence).toBeGreaterThan(unsupported.confidence);
    expect(unsupported.missingInfo.length).toBeGreaterThan(0);
  });

  it("normalizes non-100 weights", () => {
    const weights = normalizeWeights({ ...DEFAULT_SCORING_WEIGHTS, thesisMatch: 60 });
    const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
    expect(total).toBe(100);
  });

  it("treats relationship strength as a 0-100 value instead of saturating the criterion", () => {
    const base = { sourceCount: 0, supportedClaimCount: 0, interactionCount: 0, thesis: null };
    const weak = calculateFitScore({ ...base, relationshipStrength: 20 });
    const strong = calculateFitScore({ ...base, relationshipStrength: 90 });

    expect(weak.relationship).toBe(14);
    expect(strong.relationship).toBe(63);
    expect(calculateFitScore({ ...base, relationshipStrength: 500 }).relationship).toBe(70);
  });
});
