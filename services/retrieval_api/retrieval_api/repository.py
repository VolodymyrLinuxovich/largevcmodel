from __future__ import annotations

import asyncio
import math
from dataclasses import dataclass
from typing import Protocol

from pgvector import Vector
from pgvector.psycopg import register_vector_async
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from .models import ProfileRole, ProfileUpsertRequest, StoredProfile


@dataclass(frozen=True, slots=True)
class IndexedProfile:
    profile: StoredProfile
    embedding: list[float]


@dataclass(frozen=True, slots=True)
class SearchFilters:
    role: ProfileRole | None = None
    funding_stage: str | None = None
    region: str | None = None


@dataclass(frozen=True, slots=True)
class RankedProfile:
    profile: StoredProfile
    score: float


class ProfileRepository(Protocol):
    kind: str

    async def open(self) -> None: ...

    async def close(self) -> None: ...

    async def upsert(self, profile: IndexedProfile) -> StoredProfile: ...

    async def search(
        self,
        *,
        user_id: str,
        embedding: list[float],
        filters: SearchFilters,
        limit: int,
    ) -> list[RankedProfile]: ...

    async def count(self) -> int: ...


class InMemoryProfileRepository:
    kind = "memory"

    def __init__(self) -> None:
        self._profiles: dict[tuple[str, str], IndexedProfile] = {}
        self._lock = asyncio.Lock()

    async def open(self) -> None:
        return None

    async def close(self) -> None:
        return None

    async def upsert(self, profile: IndexedProfile) -> StoredProfile:
        async with self._lock:
            self._profiles[(profile.profile.user_id, profile.profile.id)] = profile
        return profile.profile

    async def search(
        self,
        *,
        user_id: str,
        embedding: list[float],
        filters: SearchFilters,
        limit: int,
    ) -> list[RankedProfile]:
        async with self._lock:
            profiles = list(self._profiles.values())
        ranked = [
            RankedProfile(profile=item.profile, score=_cosine_similarity(embedding, item.embedding))
            for item in profiles
            if item.profile.user_id == user_id and _matches_filters(item.profile, filters)
        ]
        return sorted(ranked, key=lambda item: (-item.score, item.profile.id))[:limit]

    async def count(self) -> int:
        async with self._lock:
            return len(self._profiles)


class PostgresProfileRepository:
    kind = "postgres"

    def __init__(self, database_url: str) -> None:
        self._pool = AsyncConnectionPool(
            conninfo=database_url,
            min_size=0,
            max_size=10,
            open=False,
            kwargs={"row_factory": dict_row},
            configure=register_vector_async,
        )

    async def open(self) -> None:
        await self._pool.open()
        await self._pool.wait()

    async def close(self) -> None:
        await self._pool.close()

    async def upsert(self, indexed: IndexedProfile) -> StoredProfile:
        profile = indexed.profile
        async with self._pool.connection() as connection, connection.cursor() as cursor:
            await cursor.execute(
                """
                INSERT INTO retrieval_profiles (
                  user_id, profile_id, full_name, role, funding_stage, region,
                  summary, keywords, embedding_model, source_content_hash, embedding
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (user_id, profile_id) DO UPDATE SET
                  full_name = EXCLUDED.full_name,
                  role = EXCLUDED.role,
                  funding_stage = EXCLUDED.funding_stage,
                  region = EXCLUDED.region,
                  summary = EXCLUDED.summary,
                  keywords = EXCLUDED.keywords,
                  embedding_model = EXCLUDED.embedding_model,
                  source_content_hash = EXCLUDED.source_content_hash,
                  embedding = EXCLUDED.embedding,
                  updated_at = now()
                """,
                (
                    profile.user_id,
                    profile.id,
                    profile.full_name,
                    profile.role,
                    profile.funding_stage,
                    profile.region,
                    profile.summary,
                    profile.keywords,
                    profile.embedding_model,
                    profile.source_content_hash,
                    Vector(indexed.embedding),
                ),
            )
        return profile

    async def search(
        self,
        *,
        user_id: str,
        embedding: list[float],
        filters: SearchFilters,
        limit: int,
    ) -> list[RankedProfile]:
        vector = Vector(embedding)
        async with self._pool.connection() as connection, connection.cursor() as cursor:
            await cursor.execute(
                """
                SELECT profile_id, user_id, full_name, role, funding_stage, region,
                       summary, keywords, embedding_model, source_content_hash,
                       1 - (embedding <=> %s) AS score
                FROM retrieval_profiles
                WHERE user_id = %s
                  AND (%s::text IS NULL OR role = %s)
                  AND (%s::text IS NULL OR funding_stage = %s)
                  AND (%s::text IS NULL OR region = %s)
                ORDER BY embedding <=> %s, profile_id
                LIMIT %s
                """,
                (
                    vector,
                    user_id,
                    filters.role,
                    filters.role,
                    filters.funding_stage,
                    filters.funding_stage,
                    filters.region,
                    filters.region,
                    vector,
                    limit,
                ),
            )
            rows = await cursor.fetchall()
        return [
            RankedProfile(
                profile=StoredProfile(
                    id=row["profile_id"],
                    user_id=row["user_id"],
                    full_name=row["full_name"],
                    role=row["role"],
                    funding_stage=row["funding_stage"],
                    region=row["region"],
                    summary=row["summary"],
                    keywords=row["keywords"],
                    embedding_model=row["embedding_model"],
                    source_content_hash=row["source_content_hash"],
                ),
                score=max(-1.0, min(1.0, float(row["score"]))),
            )
            for row in rows
        ]

    async def count(self) -> int:
        async with self._pool.connection() as connection, connection.cursor() as cursor:
            await cursor.execute("SELECT count(*) AS count FROM retrieval_profiles")
            row = await cursor.fetchone()
        return int(row["count"]) if row else 0


def indexed_profile(
    request: ProfileUpsertRequest,
    *,
    embedding: list[float],
    embedding_model: str,
    source_content_hash: str,
) -> IndexedProfile:
    return IndexedProfile(
        profile=StoredProfile(
            **request.model_dump(),
            embedding_model=embedding_model,
            source_content_hash=source_content_hash,
        ),
        embedding=embedding,
    )


def _matches_filters(profile: StoredProfile, filters: SearchFilters) -> bool:
    return (
        (filters.role is None or profile.role == filters.role)
        and (filters.funding_stage is None or profile.funding_stage == filters.funding_stage)
        and (filters.region is None or profile.region == filters.region)
    )


def _cosine_similarity(left: list[float], right: list[float]) -> float:
    if len(left) != len(right):
        raise ValueError("Cannot compare embeddings with different dimensions.")
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if not left_norm or not right_norm:
        return 0.0
    return max(-1.0, min(1.0, sum(a * b for a, b in zip(left, right, strict=True)) / (left_norm * right_norm)))
