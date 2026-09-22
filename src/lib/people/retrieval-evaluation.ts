import { rankRetrievalCandidates, type RetrievalCandidate } from "./semantic";

export type RetrievalEvaluationCase = {
  id: string;
  query: string;
  relevantIds: string[];
};

export type RetrievalEvaluation = {
  corpusSize: number;
  queryCount: number;
  k: number;
  recallAtK: number;
  meanReciprocalRank: number;
  ndcgAtK: number;
  cases: Array<{
    id: string;
    query: string;
    relevantIds: string[];
    topIds: string[];
    recallAtK: number;
    reciprocalRank: number;
    ndcgAtK: number;
  }>;
};

export function evaluateRetrieval(
  corpus: RetrievalCandidate[],
  evaluationCases: RetrievalEvaluationCase[],
  k = 5,
): RetrievalEvaluation {
  if (!corpus.length) throw new Error("Retrieval evaluation requires a non-empty corpus.");
  if (!evaluationCases.length) throw new Error("Retrieval evaluation requires at least one query.");
  if (!Number.isInteger(k) || k < 1) throw new Error("k must be a positive integer.");

  const corpusIds = new Set(corpus.map((candidate) => candidate.id));
  if (corpusIds.size !== corpus.length) throw new Error("Retrieval corpus IDs must be unique.");

  const cases = evaluationCases.map((evaluationCase) => {
    const relevantIds = new Set(evaluationCase.relevantIds);
    if (!relevantIds.size) throw new Error(`Evaluation case ${evaluationCase.id} has no relevant documents.`);
    for (const id of relevantIds) {
      if (!corpusIds.has(id)) throw new Error(`Evaluation case ${evaluationCase.id} references missing document ${id}.`);
    }

    const ranked = rankRetrievalCandidates(evaluationCase.query, corpus);
    const topIds = ranked.slice(0, k).map((candidate) => candidate.id);
    const relevantRanks = ranked
      .map((candidate, index) => (relevantIds.has(candidate.id) ? index + 1 : null))
      .filter((rank): rank is number => rank !== null);
    const hitsAtK = topIds.filter((id) => relevantIds.has(id)).length;
    const idealHits = Math.min(relevantIds.size, k);
    const dcg = relevantRanks
      .filter((rank) => rank <= k)
      .reduce((total, rank) => total + 1 / Math.log2(rank + 1), 0);
    const idealDcg = Array.from({ length: idealHits }, (_, index) => 1 / Math.log2(index + 2)).reduce(
      (total, gain) => total + gain,
      0,
    );

    return {
      id: evaluationCase.id,
      query: evaluationCase.query,
      relevantIds: [...relevantIds],
      topIds,
      recallAtK: hitsAtK / relevantIds.size,
      reciprocalRank: relevantRanks[0] ? 1 / relevantRanks[0] : 0,
      ndcgAtK: idealDcg ? dcg / idealDcg : 0,
    };
  });

  return {
    corpusSize: corpus.length,
    queryCount: cases.length,
    k,
    recallAtK: mean(cases.map((item) => item.recallAtK)),
    meanReciprocalRank: mean(cases.map((item) => item.reciprocalRank)),
    ndcgAtK: mean(cases.map((item) => item.ndcgAtK)),
    cases,
  };
}

function mean(values: number[]) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}
