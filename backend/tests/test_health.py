from fastapi.testclient import TestClient

from rehis.main import create_app


def test_health_returns_ok_without_login() -> None:
    client = TestClient(create_app(), base_url="http://localhost")

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
