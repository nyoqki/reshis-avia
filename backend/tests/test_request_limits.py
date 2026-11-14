"""Regression tests for request limits: body size, /redoc and the demo forecast budget."""

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from rehis.config import Settings
from rehis.main import create_app

TOO_LARGE = {"detail": "Слишком большой запрос"}


def trip(destination: str, day: str, price: object) -> dict[str, object]:
    return {"origin": "Москва", "destination": destination, "date": day, "price": price}


@pytest.fixture
def spa_client(settings: Settings, tmp_path: Path) -> Iterator[TestClient]:
    root = tmp_path / "site"
    root.mkdir()
    (root / "index.html").write_text("<!doctype html><div id='root'>spa-index-marker</div>")
    app = create_app(settings.model_copy(update={"static_dir": root}))
    with TestClient(app) as test_client:
        yield test_client


def test_declared_oversized_body_is_413(client: TestClient) -> None:
    payload = b'{"username": "' + b"a" * 20_000 + b'", "password": "x"}'

    response = client.post(
        "/api/auth/login", content=payload, headers={"Content-Type": "application/json"}
    )

    assert response.status_code == 413
    assert response.json() == TOO_LARGE


def test_streamed_oversized_body_is_413(client: TestClient) -> None:
    def chunks() -> Iterator[bytes]:
        yield b'{"username": "'
        for _ in range(20):
            yield b"a" * 1024
        yield b'", "password": "x"}'

    response = client.post(
        "/api/auth/login", content=chunks(), headers={"Content-Type": "application/json"}
    )

    assert response.status_code == 413
    assert response.json() == TOO_LARGE


def test_small_json_body_is_not_limited(client: TestClient) -> None:
    response = client.post("/api/auth/login", json={"username": "nobody", "password": "x" * 12})

    assert response.status_code == 401


def test_redoc_is_not_served_with_frontend_mounted(spa_client: TestClient) -> None:
    response = spa_client.get("/redoc")

    assert response.status_code == 404
    assert "spa-index-marker" not in response.text


def test_demo_visitors_from_different_ips_do_not_share_the_forecast_limit(
    client: TestClient,
) -> None:
    attacker = TestClient(client.app, client=("203.0.113.1", 50000))
    jury = TestClient(client.app, client=("198.51.100.7", 50000))
    assert attacker.post("/api/auth/demo").status_code == 200
    assert jury.post("/api/auth/demo").status_code == 200
    body = trip("Сочи", "2026-06-12", 9000)

    statuses = [attacker.post("/api/forecast", json=body).status_code for _ in range(61)]

    assert statuses[:60] == [200] * 60
    assert statuses[60] == 429
    assert jury.post("/api/forecast", json=body).status_code == 200
