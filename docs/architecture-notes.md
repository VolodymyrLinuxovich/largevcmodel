# Architecture Notes

LargeVCModel is now structured as a user-scoped, integration-first product. It does not create product records without a connected account or explicit user action.

## Runtime Boundaries

- Server Components render authenticated workspace pages.
- Route handlers perform provider operations and enforce user ownership.
- Client components handle interactive actions such as research queries and approved provider writes.
- Secrets and provider tokens remain server-side.

## Data Model

The Prisma schema uses PostgreSQL and models:

- `User`, `Partner`, `Session`
- `Integration`
- `Contact`, `Company`
- `ContactInteraction`, `SyncJob`
- `GmailThread`, `GmailMessage`
- `CalendarEvent`, `CalendarSlot`, `Meeting`
- `InvestmentThesis`
- `RelationshipEdge`
- `ResearchRun`, `ResearchClaim`, `Source`, `ClaimSource`
- `FitScore`
- `OutreachDraft`, `OutreachEvent`, `Reply`
- `AuditEvent`

Claims and sources are many-to-many through `ClaimSource`.

## Integrations

Google integration modules live in `src/lib/google`:

- `oauth.ts` builds authorization URLs, exchanges codes, refreshes tokens, revokes access, and reads userinfo.
- `api.ts` resolves encrypted credentials, refreshes tokens, handles provider failures, and wraps authenticated Google fetches.
- `contacts.ts` imports People API connection records.
- `gmail.ts` imports Gmail metadata/snippets and creates/sends drafts only through explicit route calls.
- `calendar.ts` imports Calendar events, checks free/busy, and creates events after confirmation.

## Network Search

Network search is implemented in `src/lib/domain/network-search.ts`.

The search pipeline is:

- parse the natural-language objective into optional criteria;
- choose eligible entity types and sources;
- retrieve broad user-scoped candidates from Contacts, Gmail, Calendar, saved companies, profile-owned records, and research claims;
- classify records as people, companies, organizations, conversations, meetings, automated senders, mailing lists, or unknown;
- extract supporting evidence from connected records;
- score relevance with query-dependent weights;
- apply context-specific exclusions;
- return no results when evidence is insufficient.

Interaction count is intentionally a small signal. It cannot overpower entity-type, semantic, structured, and evidence-quality relevance. Automated senders are classified as a reusable signal and are suppressed or allowed based on the current query.

## Profiles

Profile models store owner-controlled public or connection-visible information:

- `UserProfile`
- `Product`
- `Project`
- `Achievement`
- `Connection`, `Follow`
- `ProfileActivity`
- `ProfileViewEvent`, `ProfileLinkClick`
- `MessageThread`, `MessageParticipant`, `PlatformMessage`

Public profile data is separate from private Gmail, Calendar, contact, and OAuth records. Private workspace evidence is not published to profiles by default. Analytics are visible only to the profile owner and use real profile view, link click, follow, connection, and platform-message records.

## Research

Research provider code lives in `src/lib/research`.

`HermesResearchProvider` can call an HTTP adapter or local CLI command. Provider failures produce an unavailable research run and audit event. No fallback provider fabricates public research.

## Provenance

Source URLs must be public URLs. They are canonicalized and deduplicated before storage. Each claim records provenance:

- `USER_PROVIDED`
- `CONNECTED_ACCOUNT`
- `PUBLIC_RESEARCH`
- `AI_INFERENCE`
- `UNVERIFIED`

The UI keeps source links, supported claims, publisher/domain, source type, origin, and publication/access dates visible.

## Approval And Writes

Provider writes are explicit:

- Gmail drafts are created only after a user approves an AI-generated draft.
- Gmail sends require a saved draft and `confirmSend: true`.
- Google Calendar creates require `confirmCreate: true`.

Every write path records an `AuditEvent`.

## Deployment

Vercel deployment requires project environment variables for:

- Postgres `DATABASE_URL`
- session and token encryption secrets
- Google OAuth client ID/secret/redirect URI
- optional Hermes provider configuration

Without those variables, the app remains configuration-gated and will not synthesize product data.
