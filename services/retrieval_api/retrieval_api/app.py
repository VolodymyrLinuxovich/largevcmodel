from __future__ import annotations

import hashlib
import secrets
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException, status

from .config import Settings
from .embeddings import EmbeddingProvider, LocalHashEmbeddingProvider, OpenAICompatibleEmbeddingProvider
from .models import HealthResponse, ProfileUpsertRequest, SearchRequest, SearchResponse, SearchResult, StoredProfile
from .repository import (
    InMemoryProfileRepository,
    PostgresProfileRepository,
    ProfileRepository,
    SearchFilters,
    indexed_profile,
)


def create_app(
    *,
    settings: Settings | None = None,
    repository: ProfileRepository | None = None,
    embedder: EmbeddingProvider | None = None,
) -> FastAPI:
    service_settings = settings or Settings.from_env()
    service_repository = repository or _build_repository(service_settings)
    service_embedder = embedder or _build_embedder(service_settings)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        await service_repository.open()
        try:
            yield
        finally:
            await service_repository.close()

    application = FastAPI(
        title="LargeVCModel Retrieval API",
        version="0.1.0",
        description="User-scoped semantic profile ingestion and vector retrieval.",
        lifespan=lifespan,
    )

    def validate_service_token(authorization: str | None) -> None:
        expected = service_settings.service_token
        if not expected and service_settings.allow_anonymous_dev:
            return
        supplied = authorization.removeprefix("Bearer ") if authorization else ""
        if not expected:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Service authentication is not configured.",
            )
        if not secrets.compare_digest(supplied, expected):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid service token.",
                headers={"WWW-Authenticate": "Bearer"},
            )

    async def authorize_service(authorization: str | None = Header(default=None)) -> None:
        validate_service_token(authorization)

    async def require_principal(
        authorization: str | None = Header(default=None),
        authenticated_user: str | None = Header(default=None, alias="X-Authenticated-User"),
    ) -> str:
        validate_service_token(authorization)
        if not authenticated_user or not authenticated_user.strip():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authenticated user context is required.",
            )
        return authenticated_user.strip()

    @application.get("/health", response_model=HealthResponse, dependencies=[Depends(authorize_service)])
    async def health() -> HealthResponse:
        return HealthResponse(
            repository=service_repository.kind,
            embedding_model=service_embedder.model,
            profile_count=await service_repository.count(),
        )

    @application.put(
        "/v1/profiles",
        response_model=StoredProfile,
    )
    async def upsert_profile(request: ProfileUpsertRequest, user_id: str = Depends(require_principal)) -> StoredProfile:
        content = request.search_text()
        embedding = await service_embedder.embed(content)
        stored = indexed_profile(
            request,
            user_id=user_id,
            embedding=embedding,
            embedding_model=service_embedder.model,
            source_content_hash=hashlib.sha256(content.encode("utf-8")).hexdigest(),
        )
        return await service_repository.upsert(stored)

    @application.post(
        "/v1/search",
        response_model=SearchResponse,
    )
    async def search(request: SearchRequest, user_id: str = Depends(require_principal)) -> SearchResponse:
        query_embedding = await service_embedder.embed(request.query)
        matches = await service_repository.search(
            user_id=user_id,
            embedding=query_embedding,
            filters=SearchFilters(
                role=request.role,
                funding_stage=request.funding_stage,
                region=request.region,
            ),
            limit=request.limit,
        )
        return SearchResponse(
            query=request.query,
            embedding_model=service_embedder.model,
            results=[SearchResult(profile=match.profile, score=round(match.score, 6)) for match in matches],
        )

    return application


def _build_repository(settings: Settings) -> ProfileRepository:
    if settings.database_url:
        return PostgresProfileRepository(settings.database_url)
    return InMemoryProfileRepository()


def _build_embedder(settings: Settings) -> EmbeddingProvider:
    if settings.embedding_api_url:
        return OpenAICompatibleEmbeddingProvider(
            api_url=settings.embedding_api_url,
            api_key=settings.embedding_api_key,
            model=settings.embedding_model,
            dimensions=settings.embedding_dimensions,
        )
    return LocalHashEmbeddingProvider(settings.embedding_dimensions)


app = create_app()
