from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

ProfileRole = Literal["investor", "founder", "operator", "researcher", "advisor"]


class ProfileUpsertRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    id: str = Field(min_length=1, max_length=128)
    full_name: str = Field(min_length=1, max_length=200)
    role: ProfileRole
    funding_stage: str | None = Field(default=None, max_length=80)
    region: str | None = Field(default=None, max_length=120)
    summary: str = Field(min_length=1, max_length=8_000)
    keywords: list[str] = Field(default_factory=list, max_length=100)

    @field_validator("keywords")
    @classmethod
    def normalize_keywords(cls, keywords: list[str]) -> list[str]:
        return list(dict.fromkeys(keyword.strip().lower() for keyword in keywords if keyword.strip()))

    def search_text(self) -> str:
        values = [self.full_name, self.role, self.funding_stage, self.region, self.summary, *self.keywords]
        return ". ".join(value for value in values if value)


class StoredProfile(BaseModel):
    id: str
    user_id: str
    full_name: str
    role: ProfileRole
    funding_stage: str | None
    region: str | None
    summary: str
    keywords: list[str]
    embedding_model: str
    source_content_hash: str


class SearchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    query: str = Field(min_length=2, max_length=2_000)
    limit: int = Field(default=10, ge=1, le=50)
    role: ProfileRole | None = None
    funding_stage: str | None = Field(default=None, max_length=80)
    region: str | None = Field(default=None, max_length=120)


class SearchResult(BaseModel):
    profile: StoredProfile
    score: float = Field(ge=-1, le=1)


class SearchResponse(BaseModel):
    query: str
    embedding_model: str
    results: list[SearchResult]


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    repository: Literal["memory", "postgres"]
    embedding_model: str
    profile_count: int
