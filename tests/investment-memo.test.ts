import { describe, expect, it } from "vitest";
import { assembleInvestmentMemo, compareWithThesis, MEMO_NOTICE } from "@/lib/memos/assemble";
import { claim, emptyBundle, person } from "./fixtures/evidence-bundle";

const thesis = {
  id: "t1",
  name: "Industrial AI",
  targetSectors: ["Robotics", "Industrial AI"],
  stages: ["Seed"],
  geographies: [],
  checkSizeMin: null,
  checkSizeMax: null,
  exclusionCriteria: "No consumer hardware",
};

function allText(value: unknown): string {
  return JSON.stringify(value);
}

describe("IC memo: no fabricated recommendation", () => {
  it("states that it contains no recommendation and never phrases one", () => {
    const memo = assembleInvestmentMemo(
      emptyBundle({
        claims: [claim({ id: "c1", text: "Acme sells to 40 factories.", category: "customers", provenance: "PUBLIC_RESEARCH", sources: [{ id: "s1", url: "https://a.example" }] })],
      }),
    );

    expect(memo.notice).toBe(MEMO_NOTICE);
    expect(Object.keys(memo)).not.toContain("recommendation");
    const generatedAndSummary = allText([memo.executiveSummary, memo.counterarguments, memo.risks.generated, memo.diligenceQuestions]);
    expect(generatedAndSummary).not.toMatch(/\b(we recommend|recommend investing|should invest|strong buy|approve the investment)\b/i);
  });

  it("summarizes the evidence set honestly when almost nothing is known", () => {
    const memo = assembleInvestmentMemo(emptyBundle());

    expect(memo.executiveSummary).toContain(
      "No sensitive key fact (revenue, funding, valuation, headcount, traction, investors, customers) is supported by stored evidence.",
    );
    expect(memo.traction.map((fact) => fact.status)).toEqual(["UNAVAILABLE", "UNAVAILABLE", "UNAVAILABLE"]);
    expect(memo.thesisAlignment).toMatchObject({ status: "NO_THESIS" });
    expect(memo.counterarguments.map((item) => item.text)).toContain(
      "No traction, revenue or customer evidence is established; any case for the company currently rests on descriptive information.",
    );
    expect(memo.sourceAppendix).toEqual([]);
  });
});

describe("IC memo: evidence classes stay separated", () => {
  const bundle = emptyBundle({
    company: { ...emptyBundle().company, sector: "Robotics" },
    claims: [
      claim({ id: "market-public", text: "The industrial robotics market is growing.", category: "market", provenance: "PUBLIC_RESEARCH", sources: [{ id: "s1", url: "https://research.example/market" }] }),
      claim({ id: "market-ai", text: "The market will likely triple.", category: "market", provenance: "AI_INFERENCE" }),
      claim({ id: "product-connected", text: "Founder shared a product demo link by email.", category: "product", provenance: "CONNECTED_ACCOUNT" }),
      claim({ id: "revenue-uncited", text: "Acme has $1M ARR.", category: "revenue", provenance: "PUBLIC_RESEARCH" }),
      claim({ id: "risk", text: "A competitor filed a patent lawsuit.", category: "risk", provenance: "PUBLIC_RESEARCH", sources: [{ id: "s2", url: "https://news.example/lawsuit" }] }),
    ],
  });
  const memo = assembleInvestmentMemo(bundle);

  it("puts only established evidence into topical sections", () => {
    expect(memo.market.map((item) => item.record.id)).toEqual(["market-public"]);
    expect(memo.product.map((item) => [item.record.id, item.evidenceClass])).toEqual([["product-connected", "CONNECTED_ACCOUNT"]]);
    expect(memo.risks.evidence.map((item) => item.record.id)).toEqual(["risk"]);
    expect(memo.inferences.map((item) => item.record.id)).toEqual(["market-ai"]);
    expect(memo.unverified.map((item) => item.record.id)).toEqual(["revenue-uncited"]);
  });

  it("uses claim text only for uncategorized claims", () => {
    const uncategorized = assembleInvestmentMemo(
      emptyBundle({
        claims: [claim({ id: "u1", text: "Acme's platform uses proprietary vision models.", category: "other", provenance: "USER_PROVIDED" })],
      }),
    );
    expect(uncategorized.product.map((item) => item.record.id)).toEqual(["u1"]);
  });

  it("does not treat an uncited revenue claim as traction", () => {
    expect(memo.traction.find((fact) => fact.key === "revenue")).toMatchObject({ status: "UNVERIFIED" });
  });

  it("counts every evidence class, including user-provided company fields", () => {
    const mix = Object.fromEntries(memo.evidenceMix.map((entry) => [entry.evidenceClass, entry.count]));
    expect(mix).toEqual({ CONNECTED_ACCOUNT: 1, PUBLIC_SOURCE: 2, USER_PROVIDED: 1, AI_INFERENCE: 1, UNVERIFIED: 1 });
  });

  it("keeps every citation resolvable in the source appendix", () => {
    const appendixIds = new Set(memo.sourceAppendix.map((source) => source.id));
    const cited = [...memo.market, ...memo.product, ...memo.risks.evidence, ...memo.unverified, ...memo.inferences].flatMap((item) => item.sourceIds);
    expect(cited.length).toBeGreaterThan(0);
    expect(cited.every((id) => appendixIds.has(id))).toBe(true);
    expect(memo.sourceAppendix.map((source) => source.url)).toEqual(["https://research.example/market", "https://news.example/lawsuit"]);
  });

  it("flags single-source market evidence as a counterargument", () => {
    expect(memo.counterarguments.some((item) => item.text.startsWith("Market evidence rests on at most one cited source"))).toBe(true);
  });
});

describe("IC memo: thesis alignment", () => {
  it("reports unknown company fields as unknown rather than mismatches", () => {
    const base = emptyBundle({ thesis });
    const alignment = compareWithThesis({ ...base, company: { ...base.company, sector: "Industrial AI software", stage: null, geography: "Berlin" } });

    expect(alignment).toMatchObject({
      status: "COMPARED",
      rows: [
        { criterion: "Sector", match: "MATCH" },
        { criterion: "Stage", match: "UNKNOWN" },
        { criterion: "Geography", match: "NOT_DEFINED" },
      ],
    });
  });

  it("surfaces thesis exclusions and missing founders as counterarguments", () => {
    const memo = assembleInvestmentMemo(emptyBundle({ thesis, people: [person({ id: "p1", name: "Angel", role: "INTRODUCER" })] }));
    const texts = memo.counterarguments.map((item) => item.text);

    expect(texts).toContain("Check the opportunity against the thesis exclusion criteria: No consumer hardware");
    expect(texts).toContain("No founders or executives are linked, so team assessment has no relationship or identity grounding.");
    expect(memo.team.people).toEqual([]);
  });
});
