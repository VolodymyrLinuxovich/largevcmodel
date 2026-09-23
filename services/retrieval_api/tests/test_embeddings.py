import math

import pytest

from retrieval_api.embeddings import LocalHashEmbeddingProvider


@pytest.mark.asyncio
async def test_local_embeddings_are_deterministic_and_normalized() -> None:
    provider = LocalHashEmbeddingProvider(dimensions=256)

    first = await provider.embed("seed investors for autonomous defense software")
    second = await provider.embed("seed investors for autonomous defense software")

    assert first == second
    assert len(first) == 256
    assert math.sqrt(sum(value * value for value in first)) == pytest.approx(1.0)


@pytest.mark.asyncio
async def test_synonyms_produce_related_vectors() -> None:
    provider = LocalHashEmbeddingProvider(dimensions=256)
    defense = await provider.embed("defense autonomy investor")
    related = await provider.embed("dual-use robotics venture fund")
    unrelated = await provider.embed("clinical diagnostics founder")

    related_score = sum(left * right for left, right in zip(defense, related, strict=True))
    unrelated_score = sum(left * right for left, right in zip(defense, unrelated, strict=True))

    assert related_score > unrelated_score
