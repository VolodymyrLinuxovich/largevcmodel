import { describe, expect, it } from "vitest";
import { RISK_PATTERN, matchesTopic } from "@/lib/evidence/classify";
import { assembleInvestmentMemo } from "@/lib/memos/assemble";
import { claim, emptyBundle } from "./fixtures/evidence-bundle";

describe("risk category matching", () => {
  it.each(["Regulatory", "Regulation", "Risks", "Concerns", "Competitors", "Lawsuits", "Dependencies"])("treats %s as a risk category", (category) => {
    expect(matchesTopic({ category, text: "Some stored statement." }, RISK_PATTERN)).toBe(true);
  });

  it("does not match unrelated categories", () => {
    expect(matchesTopic({ category: "Product", text: "Some stored statement." }, RISK_PATTERN)).toBe(false);
  });

  it("shows regulatory and plural risk claims in the memo and its concerns", () => {
    const memo = assembleInvestmentMemo(
      emptyBundle({
        claims: [
          claim({ id: "reg", text: "The device needs FDA clearance.", category: "Regulatory", provenance: "PUBLIC_RESEARCH", sources: [{ id: "s1", url: "https://news.example/fda" }] }),
          claim({ id: "risks", text: "Key supplier is a single vendor.", category: "Risks", provenance: "PUBLIC_RESEARCH", sources: [{ id: "s2", url: "https://news.example/vendor" }] }),
        ],
      }),
    );

    expect(memo.risks.evidence.map((item) => item.record.id).sort()).toEqual(["reg", "risks"]);
    const concernText = memo.risks.generated.map((item) => item.text).join("\n");
    expect(concernText).toContain("FDA clearance");
    expect(concernText).toContain("single vendor");
  });
});
