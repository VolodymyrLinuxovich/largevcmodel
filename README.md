# LargeVCModel

LargeVCModel is an AI-native operating system for venture-capital relationship intelligence. It connects a partner's real Google workspace data, research providers, investment thesis, outreach workflow, meeting workflow, and audit history into one secure application.

The current product is not pre-populated. It does not ship contacts, companies, meetings, replies, sources, or fabricated research. If no account is connected, the app shows integration empty states. If an account is connected and no records match, it shows an honest no-results state.

## Product Overview

LargeVCModel helps investors:

- discover relevant founders, operators, experts, and investors from connected relationship data;
- search existing Gmail and Google Contacts records;
- identify warm introduction paths only when there is supporting evidence;
- research real people and companies through Hermes or another provider adapter;
- score opportunities against a saved investment thesis;
- generate evidence-limited outreach drafts;
- save approved messages to Gmail Drafts;
- send only after explicit confirmation;
- inspect meetings from Google Calendar;
- preserve sources, claims, scores, and operational audit events.

The visual system uses a dark, editorial, institutional interface inspired by defense-technology research products: near-black backgrounds, high-contrast typography, thin dividers, rectangular controls, dense technical metadata, and restrained motion.

## Architecture

- **Framework:** Next.js App Router, React, TypeScript
- **Styling:** Tailwind CSS with shadcn-style local UI primitives
- **Database:** PostgreSQL through Prisma
- **Validation:** Zod
- **Graph:** React Flow
- **Charts:** Recharts remains available for future real metrics
- **Auth:** Google OAuth 2.0, signed HTTP-only session cookie
- **Integrations:** Gmail API, People API, Google Calendar API
- **Research:** Provider abstraction with Hermes adapter
- **Security:** encrypted OAuth token storage, server-only secrets, user-scoped queries

Core server modules:

```text
src/lib/auth          session cookies and current-user resolution
src/lib/security      AES-GCM token encryption
src/lib/google        OAuth, refresh, revocation, Gmail, People, Calendar adapters
src/lib/research      Hermes provider interface
src/lib/domain        scoring, source canonicalization, research persistence, outreach generation
src/lib/workspace     user-scoped dashboard data
src/app/api           authenticated route handlers
```

## Local Setup

```bash
npm install
cp .env.example .env
npm run db:generate
npm run db:push
npm run dev
```

`npm run dev` starts Next.js. It does not import records or create any product data.

## Database Setup

Create a PostgreSQL database and set:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/largevcmodel"
```

Then run:

```bash
npm run db:generate
npm run db:push
```

The included Prisma seed script is intentionally a no-op for product data:

```bash
npm run db:seed
```

If you add that script locally, keep generated records out of production workspaces.

## Environment Variables

```env
DATABASE_URL=
SESSION_SECRET=
TOKEN_ENCRYPTION_KEY=
NEXT_PUBLIC_APP_URL=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
RESEARCH_PROVIDER=none
HERMES_API_URL=
HERMES_API_KEY=
HERMES_COMMAND=hermes
```

Secrets must remain server-side. Do not expose OAuth client secrets, access tokens, refresh tokens, research API keys, or database credentials to the browser.

## Google OAuth

Create a Google OAuth 2.0 Web Client in Google Cloud Console and set the authorized redirect URI:

```text
http://localhost:3000/api/auth/google/callback
```

For production, also add:

```text
https://YOUR_DOMAIN/api/auth/google/callback
```

The app requests scopes by integration:

- **Sign in:** `openid`, `email`, `profile`
- **Gmail:** Gmail read access and Gmail draft/compose permissions
- **Google Contacts:** People API contact read access
- **Google Calendar:** event read access, free/busy access, and event write access for confirmed meeting creation

Users can connect Gmail, Google Contacts, and Google Calendar independently from Settings. They can reconnect or revoke integrations. External write actions require explicit user confirmation.

## Gmail Integration

Gmail is used to:

- index real conversation metadata and snippets;
- link contacts to threads;
- detect interaction recency and frequency;
- generate drafts from available evidence;
- save approved drafts to Gmail Drafts;
- send a saved draft only when the user confirms;
- classify replies from provided or imported text.

The app never sends email automatically.

## Google Contacts Integration

Google Contacts are imported through the People API. The app normalizes names, emails, phone numbers, organizations, titles, profile images, notes, groups, and provider metadata. Contacts are deduplicated by provider IDs and primary email addresses where available. Missing fields stay unavailable.

## Google Calendar Integration

Google Calendar is used to import upcoming and past events, check free/busy availability, and create events only after explicit user confirmation. Calendar event links and meeting URLs come from Google Calendar responses.

## Hermes Integration

Research uses this provider contract:

```ts
interface ResearchProvider {
  researchFounder(input: ResearchRequest): Promise<ResearchResult>;
}
```

`HermesResearchProvider` supports two modes:

- HTTP adapter using `HERMES_API_URL` and optional `HERMES_API_KEY`
- CLI adapter using `HERMES_COMMAND`

Set:

```env
RESEARCH_PROVIDER=hermes
HERMES_API_URL=https://your-hermes-adapter.example/research
# or
HERMES_COMMAND=hermes
```

If Hermes is not configured or fails, research runs are marked unavailable and an audit event is recorded. The application does not substitute fabricated provider results.

## Source And Citation Design

Every research source stores:

- title;
- URL and canonical URL;
- publisher/domain;
- publication date when available;
- access timestamp;
- source type;
- origin;
- supported claims.

Claims and sources have a many-to-many relationship. A source can support multiple claims, and a claim can cite multiple sources. The UI labels:

- connected-account information;
- user-provided information;
- public research;
- AI inference;
- unverified or unavailable facts.

Local paths are rejected as research sources. Source deduplication canonicalizes public URLs by removing fragments, normalizing domains, trimming trailing slashes, and sorting query params.

## Scoring Methodology

Default score weights:

```text
30% thesis match
20% stage compatibility
15% geographic fit
15% relationship and timing momentum
10% relationship strength
10% evidence quality
```

Scores are prioritization heuristics, not objective judgments. Every stored score includes the criterion breakdown, weights, confidence, missing information, date calculated, explanation, and model/provider label.

## Human Approval Model

LargeVCModel requires human confirmation for external writes:

- generated outreach starts as `AI_GENERATED`;
- the user must approve the draft;
- the user must save it to Gmail Drafts;
- the user must explicitly confirm send;
- Calendar events require `confirmCreate: true`.

The audit log records these transitions without exposing private model reasoning.

## API Routes

```text
POST /api/query
GET  /api/contacts/search
POST /api/research
POST /api/scoring
POST /api/outreach/draft
POST /api/outreach/approve
POST /api/outreach/save-gmail-draft
POST /api/outreach/send
POST /api/replies/ingest
GET  /api/calendar/availability
POST /api/calendar/book
POST /api/meetings/create
POST /api/crm/update
GET  /api/research/:id/sources
GET  /api/auth/google/start
GET  /api/auth/google/callback
POST /api/auth/logout
POST /api/sync/google/contacts
POST /api/sync/google/gmail
POST /api/sync/google/calendar
POST /api/integrations/:id/disconnect
```

## Testing

```bash
npm run typecheck
npm run test
npm run build
```

Current unit coverage includes:

- fit scoring;
- URL canonicalization and source deduplication;
- citation mapping;
- rejection of local source URLs;
- reply classification.

## Known Limitations

- Gmail body handling is intentionally conservative and stores snippets/metadata by default.
- Relationship edges are stored, but automatic edge extraction from every synced interaction can be expanded.
- Calendar event creation is implemented through Google Calendar; availability UI can be extended into a richer scheduler.
- Research quality depends on the configured Hermes adapter.
- Production deployment requires real PostgreSQL and Google OAuth environment variables.
