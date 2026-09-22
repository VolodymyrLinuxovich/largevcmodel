import { semanticRetrievalCases, syntheticProfileCorpus } from "../benchmarks/semantic-retrieval";
import { evaluateRetrieval } from "../src/lib/people/retrieval-evaluation";

const result = evaluateRetrieval(syntheticProfileCorpus, semanticRetrievalCases, 5);
const summary = {
  corpusSize: result.corpusSize,
  queryCount: result.queryCount,
  k: result.k,
  recallAtK: round(result.recallAtK),
  meanReciprocalRank: round(result.meanReciprocalRank),
  ndcgAtK: round(result.ndcgAtK),
};

console.log(JSON.stringify(summary, null, 2));

function round(value: number) {
  return Number(value.toFixed(4));
}
