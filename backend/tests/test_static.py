from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from rehis.config import Settings
from rehis.main import create_app
from rehis.security.middleware import CSP

INDEX_HTML = "<!doctype html><html><body><div id='root'>spa-index-marker</div></body></html>"
SECRET = "top-secret-outside-static-dir"


@pytest.fixture
def static_dir(tmp_path: Path) -> Path:
    root = tmp_path / "site"
    (root / "assets").mkdir(parents=True)
    (root / "index.html").write_text(INDEX_HTML)
    (root / "assets" / "x.js").write_text("console.log('x');")
    (root / "favicon.svg").write_text("<svg xmlns='http://www.w3.org/2000/svg'/>")
    (tmp_path / "secret.txt").write_text(SECRET)
    return root


@pytest.fixture
def spa_client(settings: Settings, static_dir: Path) -> Iterator[TestClient]:
    app = create_app(settings.model_copy(update={"static_dir": static_dir}))
    with TestClient(app) as test_client:
        yield test_client


def test_root_serves_index_html_with_no_cache(spa_client: TestClient) -> None:
    response = spa_client.get("/")

    assert response.status_code == 200
    assert "spa-index-marker" in response.text
    assert response.headers["cache-control"] == "no-cache"


def test_client_route_falls_back_to_index_html(spa_client: TestClient) -> None:
    response = spa_client.get("/some/client/route")

    assert response.status_code == 200
    assert "spa-index-marker" in response.text
    assert response.headers["cache-control"] == "no-cache"


def test_hashed_asset_is_served_with_immutable_cache(spa_client: TestClient) -> None:
    response = spa_client.get("/assets/x.js")

    assert response.status_code == 200
    assert "console.log" in response.text
    assert response.headers["cache-control"] == "public, max-age=31536000, immutable"


def test_existing_top_level_file_is_served_instead_of_index(spa_client: TestClient) -> None:
    response = spa_client.get("/favicon.svg")

    assert response.status_code == 200
    assert "<svg" in response.text
    assert "spa-index-marker" not in response.text


def test_unknown_api_path_returns_json_404(spa_client: TestClient) -> None:
    response = spa_client.get("/api/unknown")

    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/json")
    assert "spa-index-marker" not in response.text


def test_api_routes_still_work_with_frontend_mounted(spa_client: TestClient) -> None:
    response = spa_client.get("/api/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_openapi_json_is_not_shadowed_by_index(spa_client: TestClient) -> None:
    response = spa_client.get("/openapi.json")

    assert response.status_code == 200
    assert response.json()["info"]["title"] == "Reshis Avia"


@pytest.mark.parametrize(
    "path",
    [
        "/../secret.txt",
        "/%2e%2e/secret.txt",
        "/%2e%2e%2fsecret.txt",
        "/..%2fsecret.txt",
        "/assets/../../secret.txt",
        "/assets/%2e%2e/%2e%2e/secret.txt",
        "/%252e%252e/secret.txt",
    ],
)
def test_path_traversal_does_not_leak_files(spa_client: TestClient, path: str) -> None:
    response = spa_client.get(path)

    assert SECRET not in response.text


def test_traversal_to_pyproject_does_not_leak(spa_client: TestClient) -> None:
    response = spa_client.get("/%2e%2e/%2e%2e/%2e%2e/pyproject.toml")

    assert "[project]" not in response.text


def test_index_html_responses_carry_strict_csp(spa_client: TestClient) -> None:
    for path in ("/", "/some/client/route"):
        response = spa_client.get(path)

        assert response.status_code == 200
        assert response.headers["content-security-policy"] == CSP
        assert response.headers["x-content-type-options"] == "nosniff"


def test_without_static_dir_unknown_path_is_404(client: TestClient) -> None:
    response = client.get("/some/client/route")

    assert response.status_code == 404
    assert "spa-index-marker" not in response.text


def test_missing_static_dir_logs_warning_and_app_still_starts(
    settings: Settings, tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    missing = tmp_path / "does-not-exist"

    with caplog.at_level("WARNING"):
        app = create_app(settings.model_copy(update={"static_dir": missing}))

    assert any(r.levelname == "WARNING" for r in caplog.records)
    with TestClient(app) as test_client:
        assert test_client.get("/api/health").status_code == 200
        assert test_client.get("/").status_code == 404


def test_redoc_is_not_served_with_frontend_mounted(spa_client: TestClient) -> None:
    response = spa_client.get("/redoc")

    assert response.status_code == 404
    assert "spa-index-marker" not in response.text
