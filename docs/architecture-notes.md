# Architecture Notes

LargeVCModel is now structured as a user-scoped, integration-first product. It does not create product records without a connected account or explicit user action.

## Runtime Boundaries

- Server Components render authenticated workspace pages.
- Route handlers perform provider operations and enforce user ownership.
- Client components handle interactive actions such as research queries and approved provider writes.
- Secrets and provider tokens remain server-side.

## Data Model

The Prisma schema uses PostgreSQL and models:

- `User`, `Partner`
- `Integration`
- `Contact`, `Company`
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
