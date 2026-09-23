import os
from pathlib import Path

import pytest
import pytest_asyncio
from psycopg import AsyncConnection

from retrieval_api.embeddings import LocalHashEmbeddingProvider
from retrieval_api.models import ProfileUpsertRequest
from retrieval_api.repository import IndexedProfile, PostgresProfileRepository, indexed_profile

pytestmark = pytest.mark.integration

DATABASE_URL = os.getenv("RETRIEVAL_DATABASE_URL")
MIGRATION_PATH = Path(__file__).parents[1] / "migrations/001_create_retrieval_profiles.sql"


async def execute_sql(sql: str) -> None:
    if DATABASE_URL is None:
        pytest.skip("RETRIEVAL_DATABASE_URL is required for PostgreSQL integration tests")

    connection = await AsyncConnection.connect(DATABASE_URL)
    try:
        await connection.execute(sql)
        await connection.commit()
    finally:
        await connection.close()


@pytest_asyncio.fixture
async def postgres_repository() -> PostgresProfileRepository:
    if DATABASE_URL is None:
        pytest.skip("RETRIEVAL_DATABASE_URL is required for PostgreSQL integration tests")

    await execute_sql(MIGRATION_PATH.read_text())
    await execute_sql("TRUNCATE retrieval_profiles")

    repository = PostgresProfileRepository(DATABASE_URL)
    await repository.open()
    try:
        yield repository
    finally:
        await repository.close()
        await execute_sql("TRUNCATE retrieval_profiles")


async def make_indexed_profile(
    profile_id: str,
    *,
    user_id: str,
    full_name: str,
    role: str,
    summary: str,
    region: str,
) -> IndexedProfile:
    request = ProfileUpsertRequest(
        id=profile_id,
        full_name=full_name,
        role=role,
        funding_stage="seed",
        region=region,
        summary=summary,
        keywords=["autonomy"],
    )
    embedding = await LocalHashEmbeddingProvider().embed(request.search_text())
    return indexed_profile(
        request,
        user_id=user_id,
        embedding=embedding,
        embedding_model="local-hash-v1",
        source_content_hash=f"hash-{user_id}-{profile_id}",
    )


@pytest.mark.asyncio
async def test_postgres_search_is_tenant_scoped_and_filterable(postgres_repository: PostgresProfileRepository) -> None:
    profiles = [
        await make_indexed_profile(
            "target",
            user_id="user-a",
            full_name="Target Investor",
            role="investor",
            summary="Seed investor in autonomous defense and robotics.",
            region="Europe",
        ),
        await make_indexed_profile(
            "other-role",
            user_id="user-a",
            full_name="Other Role",
            role="founder",
            summary="Founder building autonomous defense software.",
            region="Europe",
        ),
        await make_indexed_profile(
            "private-target",
            user_id="user-b",
            full_name="Private Investor",
            role="investor",
            summary="Seed investor in autonomous defense and robotics.",
            region="Europe",
        ),
    ]
    for profile in profiles:
        await postgres_repository.upsert(profile)

    query = await LocalHashEmbeddingProvider().embed("autonomous defense investor")
    results = await postgres_repository.search(
        user_id="user-a",
        embedding=query,
        filters={"role": "investor"},
        limit=10,
    )

    assert [result.profile.id for result in results] == ["target"]
    assert results[0].profile.user_id == "user-a"
    assert results[0].score > 0
    assert await postgres_repository.count() == 3


@pytest.mark.asyncio
async def test_postgres_upsert_updates_in_place(postgres_repository: PostgresProfileRepository) -> None:
    original = await make_indexed_profile(
        "candidate",
        user_id="user-a",
        full_name="Original Candidate",
        role="operator",
        summary="Autonomy operator.",
        region="North America",
    )
    await postgres_repository.upsert(original)

    updated = await make_indexed_profile(
        "candidate",
        user_id="user-a",
        full_name="Updated Candidate",
        role="operator",
        summary="Geospatial autonomy operator.",
        region="North America",
    )
    await postgres_repository.upsert(updated)

    query = await LocalHashEmbeddingProvider().embed("geospatial operator")
    results = await postgres_repository.search(user_id="user-a", embedding=query, filters={}, limit=10)

    assert await postgres_repository.count() == 1
    assert results[0].profile.full_name == "Updated Candidate"
