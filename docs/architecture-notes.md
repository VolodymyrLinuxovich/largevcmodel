# Architecture Notes

## Directory Map

```text
src/app
  api/                  Route handlers for query, research, scoring, outreach, replies, calendar, meetings, CRM, demo reset
  audit/                Audit log page
  contacts/             Contact table and founder profile pages
  demo-sources/         Local fictional source pages used by mock research
  graph/                Relationship graph page
  meetings/             Reply and scheduling overview
  outreach/             Outreach studio
  research/             Partner research console
  settings/             Provider and scoring settings

src/components
  dashboard/            Recharts dashboard components
  graph/                React Flow relationship graph
  outreach/             Outreach workflow UI
  research/             Candidate cards, source panel, research console, founder actions
  ui/                   Lightweight shadcn-style primitives

src/lib
  api/                  JSON response helpers
  demo/                 Fixtures and reset/seed orchestration
  domain/               Intent parsing, source utilities, scoring, replies, outreach, research service
  research/             ResearchProvider, HermesResearchProvider, MockResearchProvider
  prisma.ts             Prisma singleton
```

## API Operations

Implemented route handlers:

```text
POST /api/query
GET  /api/contacts/search
POST /api/research
POST /api/scoring
POST /api/outreach/draft
POST /api/outreach/approve
POST /api/outreach/send
POST /api/replies/ingest
GET  /api/calendar/availability
POST /api/calendar/book
POST /api/meetings/create
POST /api/crm/update
GET  /api/research/:id/sources
POST /api/demo/reset
```

## Data Provenance

Important factual statements are stored as `ResearchClaim` rows. Each claim has:

- category;
- provenance;
- confidence;
- optional contact and company;
- zero or more supporting sources through `ClaimSource`.

Sources are deduplicated by canonical URL before linking. Mock public sources use local `/demo-sources/...` URLs and are labeled as demo sources.

## Research Provider Flow

`executeResearchQuery` coordinates:

1. `parsePartnerIntent`
2. seeded CRM candidate filtering
3. `researchWithFallback`
4. source canonicalization and upsert
5. claim creation and claim-source linking
6. fit scoring
7. audit event creation
8. response payload construction

`HermesResearchProvider` supports two integration paths:

- `HERMES_API_URL`: direct HTTP adapter.
- `HERMES_COMMAND`: local CLI/subprocess adapter, for example `hermes`.

Both paths expect Hermes or a wrapper adapter to return JSON with `summary`, `sources`, `claims`, `unavailable`, and `inferred`. The CLI path sends a single provenance-required prompt to Hermes and parses the JSON response. Credentials stay outside the repo in `~/.hermes/.env` or the shell environment.

## Scoring

`calculateFitScore` is deterministic and testable. It combines:

- sector match;
- stage match;
- Bay Area geography;
- recency of funding;
- relationship strength;
- source and claim evidence quality.

The result includes component scores, total score, explanation, citations, and weights.

## Demo State

`resetDemoData` is shared by:

- `prisma/seed.ts`
- `POST /api/demo/reset`

That keeps command-line seeding and the in-app Reset button deterministic.
