import hashlib
import hmac

import pytest
from fastapi.testclient import TestClient

from retrieval_api.app import create_app
from retrieval_api.config import Settings
from retrieval_api.embeddings import LocalHashEmbeddingProvider
from retrieval_api.repository import InMemoryProfileRepository


def build_client(*, service_token: str | None = None) -> TestClient:
    return TestClient(
        create_app(
            settings=Settings(
                service_token=service_token,
                identity_signing_secret="identity-secret" if service_token else None,
                allow_anonymous_dev=service_token is None,
            ),
            repository=InMemoryProfileRepository(),
            embedder=LocalHashEmbeddingProvider(),
        )
    )


def sign_user(user_id: str) -> str:
    return hmac.new(b"identity-secret", user_id.encode("utf-8"), hashlib.sha256).hexdigest()


def profile(
    profile_id: str,
    *,
    full_name: str,
    role: str,
    summary: str,
    funding_stage: str = "seed",
    region: str = "Europe",
) -> dict[str, object]:
    return {
        "id": profile_id,
        "full_name": full_name,
        "role": role,
        "funding_stage": funding_stage,
        "region": region,
        "summary": summary,
        "keywords": [],
    }


def test_ingests_and_ranks_profiles_with_user_scoping() -> None:
    with build_client() as client:
        candidates = [
            profile(
                "defense-investor",
                full_name="Jordan Lee",
                role="investor",
                summary="Seed investor in autonomous defense, national-security software, and robotics.",
            ),
            profile(
                "healthcare-investor",
                full_name="Morgan Chen",
                role="investor",
                summary="Series A investor in clinical diagnostics and patient care.",
            ),
            profile(
                "private-profile",
                full_name="Private Candidate",
                role="investor",
                summary="Defense autonomy and dual-use robotics venture investor.",
            ),
        ]
        for candidate in candidates[:2]:
            response = client.put("/v1/profiles", json=candidate, headers={"X-Authenticated-User": "user-1"})
            assert response.status_code == 200
        response = client.put(
            "/v1/profiles",
            json=candidates[2],
            headers={"X-Authenticated-User": "user-2"},
        )
        assert response.status_code == 200

        response = client.post(
            "/v1/search",
            json={"query": "dual-use autonomous defense venture partner", "limit": 5},
            headers={"X-Authenticated-User": "user-1"},
        )

        assert response.status_code == 200
        results = response.json()["results"]
        assert results[0]["profile"]["id"] == "defense-investor"
        assert {result["profile"]["id"] for result in results} == {"defense-investor", "healthcare-investor"}
        assert all(result["profile"]["user_id"] == "user-1" for result in results)


def test_applies_structured_filters() -> None:
    with build_client() as client:
        client.put(
            "/v1/profiles",
            json=profile(
                "investor",
                full_name="Investor",
                role="investor",
                summary="Climate technology and carbon markets.",
            ),
            headers={"X-Authenticated-User": "user-1"},
        )
        client.put(
            "/v1/profiles",
            json=profile(
                "founder",
                full_name="Founder",
                role="founder",
                summary="Climate technology and carbon markets.",
            ),
            headers={"X-Authenticated-User": "user-1"},
        )

        response = client.post(
            "/v1/search",
            json={"query": "climate technology", "role": "founder"},
            headers={"X-Authenticated-User": "user-1"},
        )

        assert response.status_code == 200
        assert [item["profile"]["id"] for item in response.json()["results"]] == ["founder"]


def test_upsert_replaces_existing_profile_without_duplication() -> None:
    with build_client() as client:
        first = profile("candidate", full_name="Old Name", role="operator", summary="Autonomy operator.")
        updated = {**first, "full_name": "Updated Name", "summary": "Geospatial autonomy operator."}

        headers = {"X-Authenticated-User": "user-1"}
        assert client.put("/v1/profiles", json=first, headers=headers).status_code == 200
        assert client.put("/v1/profiles", json=updated, headers=headers).status_code == 200

        health = client.get("/health").json()
        response = client.post("/v1/search", json={"query": "geospatial operator"}, headers=headers)

        assert health["profile_count"] == 1
        assert response.json()["results"][0]["profile"]["full_name"] == "Updated Name"


def test_service_and_user_authentication() -> None:
    with build_client(service_token="secret") as client:
        payload = profile("candidate", full_name="Candidate", role="advisor", summary="Fundraising advisor.")

        user_headers = {"X-Authenticated-User": "user-1"}
        assert client.put("/v1/profiles", json=payload, headers=user_headers).status_code == 401
        assert client.put(
            "/v1/profiles",
            json=payload,
            headers={**user_headers, "Authorization": "Bearer wrong"},
        ).status_code == 401
        assert client.put(
            "/v1/profiles",
            json=payload,
            headers={**user_headers, "Authorization": "Bearer secret"},
        ).status_code == 401
        assert client.put(
            "/v1/profiles",
            json=payload,
            headers={
                **user_headers,
                "Authorization": "Bearer secret",
                "X-Authenticated-User-Signature": sign_user("user-1"),
            },
        ).status_code == 200


def test_rejects_forged_user_context() -> None:
    with build_client(service_token="secret") as client:
        payload = profile("candidate", full_name="Candidate", role="advisor", summary="Fundraising advisor.")
        headers = {
            "Authorization": "Bearer secret",
            "X-Authenticated-User": "attacker-selected-user",
            "X-Authenticated-User-Signature": sign_user("trusted-user"),
        }

        assert client.put("/v1/profiles", json=payload, headers=headers).status_code == 401


def test_requires_user_context_even_in_anonymous_development_mode() -> None:
    with build_client() as client:
        payload = profile("candidate", full_name="Candidate", role="advisor", summary="Fundraising advisor.")

        assert client.put("/v1/profiles", json=payload).status_code == 401


def test_rejects_tenant_selection_in_request_body() -> None:
    with build_client() as client:
        payload = profile("candidate", full_name="Candidate", role="advisor", summary="Fundraising advisor.")
        payload["user_id"] = "attacker-selected-user"

        response = client.put(
            "/v1/profiles",
            json=payload,
            headers={"X-Authenticated-User": "trusted-user"},
        )

        assert response.status_code == 422


def test_rejects_database_mode_without_service_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RETRIEVAL_DATABASE_URL", "postgresql://localhost/retrieval")
    monkeypatch.delenv("RETRIEVAL_SERVICE_TOKEN", raising=False)

    with pytest.raises(ValueError, match="RETRIEVAL_SERVICE_TOKEN"):
        Settings.from_env()


def test_rejects_database_mode_without_identity_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RETRIEVAL_DATABASE_URL", "postgresql://localhost/retrieval")
    monkeypatch.setenv("RETRIEVAL_SERVICE_TOKEN", "service-secret")
    monkeypatch.delenv("RETRIEVAL_IDENTITY_SIGNING_SECRET", raising=False)

    with pytest.raises(ValueError, match="RETRIEVAL_IDENTITY_SIGNING_SECRET"):
        Settings.from_env()


def test_rejects_production_without_database(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RETRIEVAL_ENV", "production")
    monkeypatch.delenv("RETRIEVAL_DATABASE_URL", raising=False)
    monkeypatch.setenv("RETRIEVAL_SERVICE_TOKEN", "service-secret")

    with pytest.raises(ValueError, match="RETRIEVAL_DATABASE_URL"):
        Settings.from_env()


def test_repository_factory_rejects_production_memory_mode() -> None:
    with pytest.raises(ValueError, match="RETRIEVAL_DATABASE_URL"):
        create_app(settings=Settings(environment="production", service_token="service-secret"))


def test_rejects_unknown_fields() -> None:
    with build_client() as client:
        payload = profile("candidate", full_name="Candidate", role="advisor", summary="Fundraising advisor.")
        payload["unsupported"] = "value"

        response = client.put("/v1/profiles", json=payload, headers={"X-Authenticated-User": "user-1"})

        assert response.status_code == 422
