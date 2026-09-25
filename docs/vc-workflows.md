# VC Workflows

This document describes the venture workflow layer built on top of LargeVCModel's connected-account data, research provenance and scoring: relationship health, the opportunity pipeline, meeting briefs, IC memos and watchlists.

All five features follow the same rules as the rest of the application:

- every query is scoped by `userId`; foreign IDs behave exactly like missing IDs (404);
- nothing is fabricated: absent data is reported as unavailable, never scored or filled in;
- evidence keeps its provenance, and generated content is labelled as generated;
- state transitions are recorded in `OpportunityEvent` history and in the audit log.

## Module layout

```text
src/lib/domain/relationship-health.ts          pure health engine (no I/O)
src/lib/domain/relationship-health-service.ts  batched loading, persistence and snapshots
src/lib/domain/relationship-health-sync.ts     post-sync recalculation hook
src/lib/domain/data-deletion.ts                dataset deletion with derived-data rebuild
src/lib/pipeline/                              stages, transitions, schemas, service, queries, theses
src/lib/evidence/                              evidence classes, URL safety, loader, shared sections
src/lib/briefs/                                meeting brief assembler and persistence
src/lib/memos/                                 IC memo assembler and persistence
src/lib/watchlist/                             signal derivation, schemas and service
```

Pure modules (`relationship-health.ts`, `pipeline/stages.ts`, `pipeline/transitions.ts`, `evidence/sections.ts`, `briefs/assemble.ts`, `memos/assemble.ts`, `watchlist/signals.ts`) contain the business rules and are unit tested without a database. Services own queries, transactions and audit events.

## Relationship health

Health is computed deterministically from `ContactInteraction` records (Gmail sent/received, Calendar meetings) and `RelationshipEdge` records. No model is asked to judge a relationship.

| Component | Weight | Signal |
| --- | --- | --- |
| Recency | 35 | `100 × 0.5^(days since last direct interaction / 45)` |
| Frequency | 20 | `100 × (1 − e^(−n/4))` for direct interactions in the last 90 days |
| Email reciprocity | 15 | `min(sent, received) / max(sent, received)`; one-way outreach scores 10, unanswered inbound 25 |
| Meetings | 15 | 30 per meeting in the last 180 days, +25 for a scheduled meeting |
| Historical depth | 15 | lifetime interactions, relationship span and strongest graph edge |

- A component without data (for example, Calendar not connected) is **excluded** and the remaining weights are renormalized; it is never scored as zero.
- **Insufficient data** (no direct interactions ever observed, or a single email with no meeting) yields state `INSUFFICIENT_DATA` and a `null` score. This is distinct from `DORMANT`, which requires real history followed by more than 180 days of inactivity. Sufficiency uses lifetime counts, so long-standing relationships whose history predates the two-year detail window are still assessed.
- States: `DORMANT` (>180 days inactive), `COOLING` (>60 days inactive, or recent 90-day activity at most half of the prior 90 days), `STRENGTHENING` (recent activity at least 1.5× prior + 1), otherwise `STABLE`.
- Future calendar events are upcoming meetings, not past interactions.
- Follow-up date: last interaction + median gap between interaction days (bounded to 14–90 days, default 30); for dormant relationships, the date the dormancy threshold was crossed. The due date is fixed (overdue days are reported separately), so recalculating an overdue contact does not create a new snapshot. A scheduled meeting suppresses the recommendation.

Health is recalculated and persisted for touched contacts after every Gmail or Calendar sync page, on demand (`POST /api/relationships/health/refresh`) and before watchlist checks. Because health decays with time, every view (contact page, contact list, pipeline board, opportunity page, briefs, memos) and opportunity scoring compute it **live** from interactions; the persisted `Contact.healthScore/healthState/nextFollowUpAt` columns are used for sorting and for change history. `RelationshipHealthSnapshot` rows are appended only when the result changes. Deleting imported Gmail or Calendar data removes the derived interactions, edges and snapshots and recomputes health from what remains.

## Opportunity pipeline

`Opportunity` references a `Company`, optional `InvestmentThesis`, optional introducer `Contact`, and its current `FitScore`. People are linked through `OpportunityContact` with a role.

Lifecycle: `SOURCED → SCREENING → MEETING → DILIGENCE → IC → INVESTED`, plus `PASSED`.

- Forward moves may skip stages. `INVESTED` requires `IC` and is terminal.
- `PASSED` requires a pass reason. Backward moves and reopening a passed deal require a note; a passed deal reopens only into `SOURCED` or `SCREENING`.
- One open opportunity per company is enforced by the unique nullable `openCompanyKey`, which is cleared when the deal closes.
- Every mutation checks `expectedVersion` (optimistic concurrency). A stale version returns `409`; invalid transitions return `422`.
- Opportunity fit scores reuse `calculateFitScore`; the relationship input is the strongest live health among linked people. Criteria that cannot be assessed (no thesis target, unknown company field, no assessed relationship, no activity) are recorded as `null`, excluded, and the remaining weights renormalized; they are listed as missing information rather than scored as zero. Thesis terms match on whole words. Changing an opportunity's thesis detaches its fit score.
- Re-entering an existing company name reuses the company and only fills fields that are empty.

## Evidence classes

Briefs and memos reuse `ResearchClaim`, `Source` and `ClaimSource` and the existing citation map. Each item is classified:

| Class | Origin |
| --- | --- |
| Connected account | Gmail threads, Calendar events, relationship edges, `CONNECTED_ACCOUNT` claims |
| Public source | `PUBLIC_RESEARCH` claims with at least one stored source |
| User provided | Company fields entered in LargeVCModel and `USER_PROVIDED` claims |
| AI inference | `AI_INFERENCE` claims (never shown as fact) |
| Unverified | `UNVERIFIED` claims and `PUBLIC_RESEARCH` claims without a source |

Claims produced by a research provider cannot label themselves user-provided or connected-account evidence; those labels are stored and shown as unverified.

Revenue, funding, valuation, headcount, traction, investors and customers show "evidence found" only when a claim in the first three classes is categorized under that fact (claim wording is used only for uncategorized claims), and the claim text is always displayed with it; otherwise they are listed as unverified or unavailable. Rendered links are limited to `http(s)` URLs, and source ingestion rejects other schemes.

## Meeting briefs and IC memos

Both are assembled deterministically from a single user-scoped evidence bundle and stored as versioned JSON snapshots (`MeetingBrief`, `InvestmentMemo`). A brief can target an upcoming calendar event only if the event includes someone linked to the opportunity. A fit score calculated against a different thesis than the one now in effect is reported as needing a rescore. Generated concerns, counterarguments and questions are rule-based, labelled "generated suggestion", and carry the basis that triggered them. No language model writes briefs or memos, and memos never contain an investment recommendation. Memo drafts can be finalized once, with explicit confirmation.

## Watchlists and signals

Users can watch companies, contacts and opportunities. Signals are derived only from records LargeVCModel already stores and learned about after the item was last checked:

- new research claims and sources, new Gmail or Calendar interactions;
- relationship-health state changes or score moves of at least 10 points (the first calculation is a baseline);
- opportunity stage changes;
- fit-score moves of at least 5 points against a previous score.

Each signal records provenance, when the underlying event occurred and when it was detected. A unique `dedupeKey` makes checks idempotent. Each check reads records oldest-first in bounded batches; if a batch is full, the checkpoint advances only past what was processed, so large backfills are never skipped. Checks run on demand and after each sync pass; **LargeVCModel does not monitor the internet**.

## Migrations

New migrations: `202609240001_relationship_health`, `202609240002_opportunity_pipeline`, `202609240003_meeting_briefs`, `202609240004_memos_watchlists`, `202609240005_vc_workflow_indexes` (composite indexes for the new query patterns and GIN indexes on `CalendarEvent.attendees` and `GmailThread.participantEmails`). The watchlist migration adds a `CHECK` constraint (exactly one target per item) that `prisma db push` does not create; the service layer enforces the same rule.

## Testing

- `npm test`: unit tests for the pure modules, services with fake Prisma clients, and route handlers.
- `npm run test:integration`: PostgreSQL-backed tests (user isolation, concurrency, cascades, deletion, deduplication). Requires `TEST_DATABASE_URL` pointing at a disposable database whose schema is current (`prisma db push`). CI runs them against a PostgreSQL 16 service container.
