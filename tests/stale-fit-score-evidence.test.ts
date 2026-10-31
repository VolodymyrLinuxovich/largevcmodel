import { describe, expect, it } from "vitest";
import { assembleMeetingBrief } from "@/lib/briefs/assemble";
import { assembleInvestmentMemo } from "@/lib/memos/assemble";
import { emptyBundle, NOW } from "./fixtures/evidence-bundle";

const thesis = {
  id: "t-new",
  name: "New thesis",
  targetSectors: ["Robotics"],
  stages: ["Seed"],
  geographies: ["Europe"],
  checkSizeMin: null,
  checkSizeMax: null,
  exclusionCriteria: null,
};

const fitScore = {
  id: "f1",
  overall: 70,
  confidence: 30,
  criteria: { thesisMatch: 92, stageFit: 35, geographyFit: 35 },
  weights: { thesisMatch: 30, stageFit: 20, geographyFit: 15 },
  missingInfo: ["Company stage is unavailable."],
  explanation: "x",
  modelOrProvider: "LargeVCModel heuristic v1",
  calculatedAt: NOW,
  scoredThesisName: "Old thesis",
};

const texts = (items: Array<{ text: string }>) => items.map((item) => item.text).join("\n");

describe("fit score calculated against a different thesis", () => {
  const stale = emptyBundle({ thesis, fitScore: { ...fitScore, thesisChanged: true } });
  const current = emptyBundle({ thesis, fitScore: { ...fitScore, thesisChanged: false } });

  it("does not raise low criterion concerns or questions in the brief", () => {
    const brief = assembleMeetingBrief(stale);
    expect(texts(brief.generated.concerns)).not.toMatch(/Low .* in the stored fit score/);
    expect(texts(brief.generated.questions)).not.toContain("thesis stage focus");
    expect(brief.missingInformation.some((item) => item.startsWith("Fit score:"))).toBe(false);
  });

  it("does not use the stale score in memo counterarguments", () => {
    const memo = assembleInvestmentMemo(stale);
    expect(texts(memo.counterarguments)).not.toContain("fit score is relatively high");
    expect(texts(memo.risks.generated)).not.toMatch(/Low .* in the stored fit score/);
  });

  it("still uses a score calculated against the current thesis", () => {
    const brief = assembleMeetingBrief(current);
    expect(texts(brief.generated.concerns)).toContain("Low stage fit in the stored fit score.");
    expect(texts(brief.generated.questions)).toContain("thesis stage focus (Seed)");
    expect(brief.missingInformation).toContain("Fit score: Company stage is unavailable.");
    expect(texts(assembleInvestmentMemo(current).counterarguments)).toContain("fit score is relatively high");
  });
});
