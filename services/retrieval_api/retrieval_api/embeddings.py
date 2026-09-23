from __future__ import annotations

import hashlib
import math
import re
from typing import Protocol

import httpx

TOKEN_PATTERN = re.compile(r"[a-z0-9][a-z0-9$.-]+")

SYNONYMS: dict[str, tuple[str, ...]] = {
    "defense": ("national-security", "dual-use", "military", "warfighter"),
    "ai": ("artificial-intelligence", "machine-learning", "ml"),
    "autonomy": ("autonomous", "unmanned", "robotics", "drones"),
    "geospatial": ("gis", "imagery", "mapping", "intelligence"),
    "climate": ("weather", "risk", "earth", "environment"),
    "investor": ("venture", "capital", "partner", "fund"),
    "founder": ("cofounder", "entrepreneur", "startup"),
}


class EmbeddingProvider(Protocol):
    model: str
    dimensions: int

    async def embed(self, text: str) -> list[float]: ...


class LocalHashEmbeddingProvider:
    """Deterministic credential-free fallback for local development and CI."""

    model = "local-hash-v1"

    def __init__(self, dimensions: int = 256) -> None:
        self.dimensions = dimensions

    async def embed(self, text: str) -> list[float]:
        vector = [0.0] * self.dimensions
        for token in _expand_tokens(_tokenize(text)):
            digest = hashlib.sha256(token.encode("utf-8")).digest()
            index = int.from_bytes(digest[:4], "big") % self.dimensions
            sign = 1.0 if digest[4] % 2 == 0 else -1.0
            vector[index] += sign * _token_weight(token)
        return _normalize(vector)


class OpenAICompatibleEmbeddingProvider:
    """Calls an OpenAI-compatible `/embeddings` endpoint without coupling to an SDK."""

    def __init__(
        self,
        *,
        api_url: str,
        api_key: str | None,
        model: str,
        dimensions: int = 256,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.api_url = api_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.dimensions = dimensions
        self._client = client

    async def embed(self, text: str) -> list[float]:
        headers = {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}
        payload = {"model": self.model, "input": text, "dimensions": self.dimensions}
        client = self._client or httpx.AsyncClient(timeout=20)
        try:
            response = await client.post(f"{self.api_url}/embeddings", headers=headers, json=payload)
            response.raise_for_status()
            vector = response.json()["data"][0]["embedding"]
        finally:
            if self._client is None:
                await client.aclose()
        if len(vector) != self.dimensions:
            raise ValueError(f"Embedding provider returned {len(vector)} dimensions; expected {self.dimensions}.")
        return _normalize([float(value) for value in vector])


def _tokenize(text: str) -> list[str]:
    return TOKEN_PATTERN.findall(text.lower())


def _expand_tokens(tokens: list[str]) -> set[str]:
    expanded = set(tokens)
    for token in tokens:
        for canonical, related in SYNONYMS.items():
            if token == canonical or token in related:
                expanded.add(canonical)
                expanded.update(related)
    return expanded


def _token_weight(token: str) -> float:
    if len(token) > 8:
        return 1.25
    if len(token) > 4:
        return 1.0
    return 0.7


def _normalize(vector: list[float]) -> list[float]:
    norm = math.sqrt(sum(value * value for value in vector))
    if not norm:
        return vector
    return [value / norm for value in vector]
