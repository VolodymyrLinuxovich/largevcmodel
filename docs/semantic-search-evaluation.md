# Semantic Search Evaluation

LargeVCModel includes a deterministic retrieval benchmark so changes to tokenization, semantic expansion, or ranking can be measured before deployment.

## Scope

The benchmark generates 120 synthetic profiles from combinations of:

- five sectors;
- three funding stages;
- four geographic regions;
- two roles (investor and founder).

Ten representative natural-language queries each identify a known relevant profile. The benchmark exercises the same pure hybrid retrieval primitive used by the people-search pipeline. It does not require provider credentials, a database, or private profile data.

The corpus is intentionally synthetic. It validates deterministic retrieval behavior at a corpus size above 100; it is not evidence of production traffic, production relevance, or customer data volume.

## Metrics

Run:

```bash
npm run eval:retrieval
```

Current baseline:

```json
{
  "corpusSize": 120,
  "queryCount": 10,
  "k": 5,
  "recallAtK": 1,
  "meanReciprocalRank": 0.95,
  "ndcgAtK": 0.9631
}
```

- **Recall@5** measures how many known relevant profiles appear in the first five results.
- **Mean reciprocal rank (MRR)** rewards placing the first relevant result near the top.
- **nDCG@5** measures ranking quality within the first five results.

The regression test requires Recall@5 >= 0.90, MRR >= 0.80, and nDCG@5 >= 0.80. CI runs the benchmark along with linting, typechecking, unit tests, and the production build.

## Reproducing And Extending

- Corpus and query fixtures: `benchmarks/semantic-retrieval.ts`
- Metric implementation: `src/lib/people/retrieval-evaluation.ts`
- Regression thresholds: `tests/semantic-retrieval-benchmark.test.ts`

Add cases that expose real ranking failures, keep relevance labels explicit, and avoid adding private or customer-derived data to the repository.
