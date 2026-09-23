from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Settings:
    database_url: str | None = None
    service_token: str | None = None
    allow_anonymous_dev: bool = False
    embedding_api_url: str | None = None
    embedding_api_key: str | None = None
    embedding_model: str = "text-embedding-3-small"
    embedding_dimensions: int = 256

    @classmethod
    def from_env(cls) -> Settings:
        database_url = os.getenv("RETRIEVAL_DATABASE_URL") or None
        service_token = os.getenv("RETRIEVAL_SERVICE_TOKEN") or None
        if database_url and not service_token:
            raise ValueError("RETRIEVAL_SERVICE_TOKEN is required when RETRIEVAL_DATABASE_URL is configured.")
        dimensions = int(os.getenv("RETRIEVAL_EMBEDDING_DIMENSIONS", "256"))
        if dimensions != 256:
            raise ValueError("RETRIEVAL_EMBEDDING_DIMENSIONS must be 256 to match the pgvector migration.")
        return cls(
            database_url=database_url,
            service_token=service_token,
            allow_anonymous_dev=(os.getenv("RETRIEVAL_ALLOW_ANONYMOUS_DEV", "").lower() == "true" or not database_url),
            embedding_api_url=os.getenv("RETRIEVAL_EMBEDDING_API_URL") or None,
            embedding_api_key=os.getenv("RETRIEVAL_EMBEDDING_API_KEY") or None,
            embedding_model=os.getenv("RETRIEVAL_EMBEDDING_MODEL", "text-embedding-3-small"),
            embedding_dimensions=dimensions,
        )
