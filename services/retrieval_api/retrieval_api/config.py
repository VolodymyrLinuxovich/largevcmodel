from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Settings:
    environment: str = "development"
    database_url: str | None = None
    service_token: str | None = None
    identity_signing_secret: str | None = None
    allow_anonymous_dev: bool = False
    embedding_api_url: str | None = None
    embedding_api_key: str | None = None
    embedding_model: str = "text-embedding-3-small"
    embedding_dimensions: int = 256

    @classmethod
    def from_env(cls) -> Settings:
        environment = os.getenv("RETRIEVAL_ENV", "development").strip().lower()
        if environment not in {"development", "test", "staging", "production"}:
            raise ValueError("RETRIEVAL_ENV must be development, test, staging, or production.")
        database_url = os.getenv("RETRIEVAL_DATABASE_URL") or None
        service_token = os.getenv("RETRIEVAL_SERVICE_TOKEN") or None
        identity_signing_secret = os.getenv("RETRIEVAL_IDENTITY_SIGNING_SECRET") or None
        if not database_url and environment not in {"development", "test"}:
            raise ValueError("RETRIEVAL_DATABASE_URL is required outside development and test environments.")
        if database_url and not service_token:
            raise ValueError("RETRIEVAL_SERVICE_TOKEN is required when RETRIEVAL_DATABASE_URL is configured.")
        if database_url and not identity_signing_secret:
            raise ValueError(
                "RETRIEVAL_IDENTITY_SIGNING_SECRET is required when RETRIEVAL_DATABASE_URL is configured."
            )
        dimensions = int(os.getenv("RETRIEVAL_EMBEDDING_DIMENSIONS", "256"))
        if dimensions != 256:
            raise ValueError("RETRIEVAL_EMBEDDING_DIMENSIONS must be 256 to match the pgvector migration.")
        return cls(
            environment=environment,
            database_url=database_url,
            service_token=service_token,
            identity_signing_secret=identity_signing_secret,
            allow_anonymous_dev=(
                environment == "development"
                and not database_url
                and os.getenv("RETRIEVAL_ALLOW_ANONYMOUS_DEV", "").lower() == "true"
            ),
            embedding_api_url=os.getenv("RETRIEVAL_EMBEDDING_API_URL") or None,
            embedding_api_key=os.getenv("RETRIEVAL_EMBEDDING_API_KEY") or None,
            embedding_model=os.getenv("RETRIEVAL_EMBEDDING_MODEL", "text-embedding-3-small"),
            embedding_dimensions=dimensions,
        )
