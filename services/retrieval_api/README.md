# Python Semantic Retrieval API

This service exposes the LargeVCModel profile retrieval pipeline as a typed FastAPI application. It supports profile ingestion, embedding generation, user-scoped vector search, structured filters, and PostgreSQL persistence through pgvector.

## API

- `GET /health` reports repository status, embedding model, and indexed profile count.
- `PUT /v1/profiles` normalizes and embeds a profile, then idempotently upserts it.
- `POST /v1/search` performs cosine-similarity ranking with optional role, funding-stage, and region filters.
- Interactive OpenAPI documentation is available at `/docs` while the service is running.

Every write and query requires `X-Authenticated-User`, which should be injected by the already-authenticated upstream application. The request body cannot choose a tenant. When PostgreSQL is configured, `RETRIEVAL_SERVICE_TOKEN` is mandatory and callers must also send `Authorization: Bearer ...` for service-to-service authentication. Anonymous requests are only available in explicit in-memory development mode.

## Run Locally

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e 'services/retrieval_api[dev]'
uvicorn retrieval_api.app:app --reload --app-dir services/retrieval_api
```

Without configuration, the service uses an in-memory repository and deterministic 256-dimensional local embeddings. That mode is intended for development, tests, and API exploration.

To run the in-memory API while developing locally, set `RETRIEVAL_ALLOW_ANONYMOUS_DEV=true`; requests still need an `X-Authenticated-User` header so tenant scope is exercised.

Set `RETRIEVAL_ENV=production` or `RETRIEVAL_ENV=staging` for deployed processes. Those environments refuse to start without `RETRIEVAL_DATABASE_URL`; the service never silently falls back to in-memory storage outside development and test.

## PostgreSQL And pgvector

Apply the migration to a PostgreSQL database with the pgvector extension:

```bash
psql "$RETRIEVAL_DATABASE_URL" -f services/retrieval_api/migrations/001_create_retrieval_profiles.sql
```

Then set:

```env
RETRIEVAL_DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/largevcmodel
```

The PostgreSQL repository uses an async connection pool, tenant-scoped queries, idempotent upserts, and an HNSW cosine-distance index.

## Embedding Provider

The local fallback is credential-free and deterministic. For learned embeddings, configure an OpenAI-compatible endpoint:

```env
RETRIEVAL_EMBEDDING_API_URL=https://api.openai.com/v1
RETRIEVAL_EMBEDDING_API_KEY=...
RETRIEVAL_EMBEDDING_MODEL=text-embedding-3-small
RETRIEVAL_EMBEDDING_DIMENSIONS=256
```

The service validates the returned vector dimensions before persistence. Secrets stay server-side.

## Test

```bash
ruff check services/retrieval_api
pytest services/retrieval_api/tests -m "not integration"
```

Tests cover deterministic embeddings, semantic ranking, structured filters, tenant isolation, idempotent upserts, request validation, and optional bearer authentication. The PostgreSQL integration suite applies the migration and exercises the real pgvector repository against tenant filters and updates:

```bash
RETRIEVAL_ENV=production \
RETRIEVAL_DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/largevcmodel \
RETRIEVAL_SERVICE_TOKEN=local-test-token \
pytest services/retrieval_api/tests/test_postgres_repository.py -m integration
```

GitHub Actions runs that suite against a PostgreSQL service container with pgvector.
