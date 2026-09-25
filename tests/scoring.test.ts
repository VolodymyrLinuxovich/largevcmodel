import { describe, expect, it } from "vitest";
import { calculateFitScore, DEFAULT_SCORING_WEIGHTS, normalizeWeights } from "@/lib/domain/scoring";
import { phraseMatch } from "@/lib/domain/text-match";

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

  it("excludes unavailable criteria instead of scoring them as zero", () => {
    const thesis = { targetSectors: ["Climate"], stages: ["Seed"], geographies: ["Europe"] };
    const partial = calculateFitScore({ sector: "Climate software", sourceCount: 2, supportedClaimCount: 1, thesis });

    expect(partial).toMatchObject({ thesisMatch: 92, stageFit: null, geographyFit: null, relationship: null });
    // Only thesis match (30), momentum (15, from sourced activity) and evidence (10) are available.
    expect(partial.overall).toBe(Math.round((92 * 30 + 55 * 15 + 46 * 10) / 55));
    expect(partial.missingInfo).toEqual(expect.arrayContaining(["Company stage is unavailable.", "Geography is unavailable.", "No assessed relationship is available."]));
  });

  it("does not let missing data pull a score down", () => {
    const thesis = { targetSectors: ["Climate"], stages: ["Seed"], geographies: ["Europe"] };
    const known = calculateFitScore({ sector: "Climate", stage: "Seed", sourceCount: 0, supportedClaimCount: 0, thesis });
    const withMismatch = calculateFitScore({ sector: "Climate", stage: "Seed", geography: "Asia", sourceCount: 0, supportedClaimCount: 0, thesis });

    expect(known.geographyFit).toBeNull();
    expect(withMismatch.geographyFit).toBe(35);
    expect(known.overall).toBeGreaterThan(withMismatch.overall);
  });

  it("matches thesis terms on whole words", () => {
    expect(phraseMatch("Industrial AI software", "Industrial AI")).toBe(true);
    expect(phraseMatch("San Francisco", "San Francisco Bay Area")).toBe(true);
    expect(phraseMatch("Retail", "AI")).toBe(false);
    expect(phraseMatch("Australia", "US")).toBe(false);
    expect(calculateFitScore({ sector: "Retail", sourceCount: 0, supportedClaimCount: 0, thesis: { targetSectors: ["AI"], stages: [], geographies: [] } }).thesisMatch).toBe(35);
  });
});
