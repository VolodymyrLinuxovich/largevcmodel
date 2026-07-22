# LargeVCModel

LargeVCModel is a runnable MVP of an AI-native operating system for venture-capital relationship discovery, founder research, personalized outreach, reply tracking, and meeting scheduling.

The demo is intentionally local-first. It uses SQLite, Prisma, seeded fictional CRM data, and local demo-source pages so a partner can inspect every source used without paid services or external credentials.

## Product Overview

A VC partner can enter a request such as:

```text
Find strong AI infrastructure founders in the Bay Area who recently raised a seed round, explain why they fit our thesis, and draft personalized outreach.
```

The app will:

- parse the partner objective into structured filters;
- search seeded CRM contacts, companies, events, and relationship edges;
- enrich candidates through the configured research provider;
- preserve claim-to-source provenance;
- rank candidates with an editable heuristic score;
- explain rankings with clickable citations;
- draft personalized outreach in approval-required mode;
- simulate approval, sending, replies, slot proposals, meeting booking, and CRM updates;
- write operational decisions to the audit log.

## Screenshots

Screenshot placeholders:

- Overview dashboard: `docs/screenshots/overview.png`
- Research console: `docs/screenshots/research-console.png`
- Founder profile: `docs/screenshots/founder-profile.png`
- Relationship graph: `docs/screenshots/relationship-graph.png`

## Architecture

The implementation follows the architecture in the original README:

- **Product surface:** dashboard, research console, contacts, founder profile, relationship graph, outreach, meetings, audit log, settings.
- **API layer:** App Router route handlers under `src/app/api`.
- **Agent core:** deterministic domain services for intent parsing, retrieval, research orchestration, scoring, outreach, reply classification, scheduling, meeting-link creation, CRM updates, and audit logging.
- **Data and memory:** SQLite via Prisma, with models for contacts, companies, founders, sources, claims, many-to-many claim-source links, fit scores, outreach, replies, calendar slots, meetings, and audit events.
- **Integrations:** external email/calendar/meeting actions are simulated. Hermes is represented through a clean provider adapter.

See [docs/architecture-notes.md](docs/architecture-notes.md) for implementation details.

## Local Setup

```bash
npm install
npm run dev
```

`npm run dev` automatically runs:

```bash
npm run db:generate
npm run db:push
npm run db:seed
next dev
```

The app will be available at:

```text
http://localhost:3000
```

## Database Setup

The local demo uses SQLite at:

```text
prisma/dev.db
```

Useful commands:

```bash
npm run db:generate
npm run db:push
npm run db:seed
```

The seed script creates:

- 12 fictional founder contacts;
- 10 fictional demo companies;
- 3 VC partners;
- 4 portfolio founders or advisors;
- relationship edges;
- public-looking local demo-source records;
- internal CRM claims;
- outreach history;
- calendar availability;
- audit events.

All fictional records are marked as demo data.

## Environment Variables

Copy `.env.example` if you want to configure Hermes:

```env
RESEARCH_PROVIDER=mock
DATABASE_URL=file:./dev.db
HERMES_API_URL=
HERMES_API_KEY=
# Optional local Hermes CLI/subprocess adapter.
# Example: HERMES_COMMAND=hermes
HERMES_COMMAND=
```

Mock mode is the default and requires no credentials.

For Vercel, the non-secret runtime database value is:

```env
DATABASE_URL=file:/tmp/largevcmodel.db
```

The app copies `prisma/demo-template.db` into `/tmp` on cold start so serverless functions can write demo state.

## Hermes Integration

The research layer uses this interface:

```ts
interface ResearchProvider {
  researchFounder(input: ResearchRequest): Promise<ResearchResult>;
}
```

Implemented providers:

- `MockResearchProvider`: deterministic local demo research with local demo-source pages.
- `HermesResearchProvider`: supports both a direct HTTP adapter and a local Hermes CLI/subprocess adapter.

### Direct HTTP Adapter

Use this when you have a stable Hermes HTTP endpoint:

```env
RESEARCH_PROVIDER=hermes
HERMES_API_URL=https://your-hermes-adapter.example/research
HERMES_API_KEY=your-token
```

The app posts a provenance-required `research_founder` task and expects strict JSON with `summary`, `sources`, `claims`, `unavailable`, and `inferred`.

### Local Hermes CLI Adapter

Use this when Hermes is installed locally and no stable direct HTTP API is available:

```env
RESEARCH_PROVIDER=hermes
HERMES_COMMAND=hermes
```

The adapter calls:

```bash
hermes "<provenance-required research prompt>"
```

Hermes must return strict JSON matching the `ResearchResult` shape. If you use Hermes with OpenAI or OpenRouter, keep provider credentials in `~/.hermes/.env` or your shell environment, not in this repository:

```env
OPENAI_API_KEY=...
OPENROUTER_API_KEY=...
```

Useful Hermes setup commands:

```bash
hermes setup
hermes config
hermes config set model.provider openrouter
hermes config set model.default claude-sonnet-4
hermes tools --set all
hermes doctor
```

If Hermes is unavailable or misconfigured, the route records the fallback and uses mock research. It does not silently fabricate Hermes results.

## Source and Citation Design

Every research-backed claim is stored in `ResearchClaim`. Every source is stored in `Source`. Claims and sources are connected through `ClaimSource`, so:

- one source can support many claims;
- one claim can cite multiple sources;
- citations remain clickable;
- source panels show publisher, domain, type, publication date, accessed date, supported claims, and origin.

Provenance labels:

- `Internal CRM`: seeded private demo CRM data;
- `mock`: local demo public-source artifact;
- `hermes`: retrieved through the Hermes provider;
- `AI inference`: model-generated conclusion based on available evidence;
- `Unverified`: unsupported or partially unsupported claim.

Mock sources are local `/demo-sources/...` pages and are clearly marked fictional.

## Scoring Methodology

Default formula:

```text
Overall Fit =
30% thesis match
20% stage/check-size compatibility
15% geographic fit
15% company momentum
10% relationship strength
10% evidence quality
```

The scoring panel lets users edit weights. The UI states that the score is a prioritization heuristic, not an objective judgment of founder quality.

## Demo Walkthrough

Open `http://localhost:3000/research` and click **Run Demo**.

The scenario:

```text
Find early-stage AI infrastructure founders in the Bay Area who appear relevant to a technical seed fund and have a credible reason to speak with us now.
```

The demo:

1. parses the request;
2. searches seeded CRM data;
3. shows research provider progress;
4. ranks candidates;
5. opens citations and sources in the Sources Used panel;
6. generates approval-required outreach;
7. simulates partner approval;
8. simulates a positive reply;
9. loads available VC slots;
10. books a mock meeting;
11. updates CRM state and audit log.

Use **Reset** in the research console to replay the scenario.

## Safety and Human Approval

The MVP does not send real email, LinkedIn messages, calendar invites, Zoom links, or Google Meet links.

All external operations are simulated:

- outreach starts as draft-only;
- partner approval is required before simulated send;
- reply ingestion uses sample replies;
- scheduling uses seeded availability;
- meeting URLs are mock `https://meet.example.com/...` links;
- audit events record each action.

## Testing

```bash
npm run test
npm run typecheck
npm run build
```

Unit coverage includes:

- fit scoring;
- source canonicalization and deduplication;
- citation mapping;
- reply classification.

## Known Limitations

- Hermes support is an adapter contract, not a bundled Hermes runtime.
- Email, LinkedIn, CRM, calendar, Zoom, and Google Meet integrations are simulated.
- Mock sources are fictional local pages for provenance demonstration.
- The local database is reset by the seed script; do not use it for persistent production data.
- Authentication is omitted for the local MVP.
