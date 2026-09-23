from fastapi.testclient import TestClient

from retrieval_api.app import create_app
from retrieval_api.config import Settings
from retrieval_api.embeddings import LocalHashEmbeddingProvider
from retrieval_api.repository import InMemoryProfileRepository


def build_client(*, service_token: str | None = None) -> TestClient:
    return TestClient(
        create_app(
            settings=Settings(service_token=service_token),
            repository=InMemoryProfileRepository(),
            embedder=LocalHashEmbeddingProvider(),
        )
    )


def profile(
    profile_id: str,
    *,
    user_id: str = "user-1",
    full_name: str,
    role: str,
    summary: str,
    funding_stage: str = "seed",
    region: str = "Europe",
) -> dict[str, object]:
    return {
        "id": profile_id,
        "user_id": user_id,
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
                user_id="user-2",
                full_name="Private Candidate",
                role="investor",
                summary="Defense autonomy and dual-use robotics venture investor.",
            ),
        ]
        for candidate in candidates:
            response = client.put("/v1/profiles", json=candidate)
            assert response.status_code == 200

        response = client.post(
            "/v1/search",
            json={"user_id": "user-1", "query": "dual-use autonomous defense venture partner", "limit": 5},
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
        )
        client.put(
            "/v1/profiles",
            json=profile(
                "founder",
                full_name="Founder",
                role="founder",
                summary="Climate technology and carbon markets.",
            ),
        )

        response = client.post(
            "/v1/search",
            json={"user_id": "user-1", "query": "climate technology", "role": "founder"},
        )

        assert response.status_code == 200
        assert [item["profile"]["id"] for item in response.json()["results"]] == ["founder"]


def test_upsert_replaces_existing_profile_without_duplication() -> None:
    with build_client() as client:
        first = profile("candidate", full_name="Old Name", role="operator", summary="Autonomy operator.")
        updated = {**first, "full_name": "Updated Name", "summary": "Geospatial autonomy operator."}

        assert client.put("/v1/profiles", json=first).status_code == 200
        assert client.put("/v1/profiles", json=updated).status_code == 200

        health = client.get("/health").json()
        response = client.post("/v1/search", json={"user_id": "user-1", "query": "geospatial operator"})

        assert health["profile_count"] == 1
        assert response.json()["results"][0]["profile"]["full_name"] == "Updated Name"


def test_optional_bearer_authentication() -> None:
    with build_client(service_token="secret") as client:
        payload = profile("candidate", full_name="Candidate", role="advisor", summary="Fundraising advisor.")

        assert client.put("/v1/profiles", json=payload).status_code == 401
        assert client.put("/v1/profiles", json=payload, headers={"Authorization": "Bearer wrong"}).status_code == 401
        assert client.put("/v1/profiles", json=payload, headers={"Authorization": "Bearer secret"}).status_code == 200


def test_rejects_unknown_fields() -> None:
    with build_client() as client:
        payload = profile("candidate", full_name="Candidate", role="advisor", summary="Fundraising advisor.")
        payload["unsupported"] = "value"

        response = client.put("/v1/profiles", json=payload)

        assert response.status_code == 422
