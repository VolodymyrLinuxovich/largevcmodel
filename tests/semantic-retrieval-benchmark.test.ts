import { describe, expect, it } from "vitest";
import { semanticRetrievalCases, syntheticProfileCorpus } from "../benchmarks/semantic-retrieval";
import { evaluateRetrieval } from "@/lib/people/retrieval-evaluation";

describe("semantic retrieval benchmark", () => {
  const result = evaluateRetrieval(syntheticProfileCorpus, semanticRetrievalCases, 5);

  it("evaluates at least 100 deterministic profiles", () => {
    expect(result.corpusSize).toBe(120);
    expect(result.queryCount).toBeGreaterThanOrEqual(10);
  });

  it("meets retrieval quality regression thresholds", () => {
    expect(result.recallAtK).toBeGreaterThanOrEqual(0.9);
    expect(result.meanReciprocalRank).toBeGreaterThanOrEqual(0.8);
    expect(result.ndcgAtK).toBeGreaterThanOrEqual(0.8);
  });

  it("keeps every benchmark query diagnosable", () => {
    for (const evaluationCase of result.cases) {
      expect(evaluationCase.topIds).toHaveLength(5);
      expect(evaluationCase.relevantIds).not.toHaveLength(0);
    }
  });
});
