import mimetypes
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from rehis.config import Settings
from rehis.main import create_app
from rehis.security.middleware import CSP

IMMUTABLE = "public, max-age=31536000, immutable"


@pytest.fixture
def bare_mime_table() -> Iterator[None]:
    """Mimic the slim container: no system mime.types, only Python's built-in table."""
    saved = list(mimetypes.knownfiles)
    mimetypes.knownfiles[:] = []
    mimetypes.init()
    try:
        yield
    finally:
        mimetypes.knownfiles[:] = saved
        mimetypes.init()


@pytest.fixture
def brand_dir(tmp_path: Path) -> Path:
    root = tmp_path / "site"
    (root / "assets").mkdir(parents=True)
    (root / "index.html").write_text("<!doctype html><div id='root'></div>")
    (root / "manifest.json").write_text('{"name": "x"}')
    (root / "og.png").write_bytes(b"\x89PNG\r\n\x1a\n")
    (root / "apple-touch-icon.png").write_bytes(b"\x89PNG\r\n\x1a\n")
    (root / "favicon.svg").write_text("<svg xmlns='http://www.w3.org/2000/svg'/>")
    (root / "hero.webp").write_bytes(b"RIFF\x00\x00\x00\x00WEBP")
    (root / "assets" / "font-abc123.woff2").write_bytes(b"wOF2")
    return root


@pytest.fixture
def brand_client(
    bare_mime_table: None, settings: Settings, brand_dir: Path
) -> Iterator[TestClient]:
    app = create_app(settings.model_copy(update={"static_dir": brand_dir}))
    with TestClient(app) as test_client:
        yield test_client


def test_manifest_is_json_with_nosniff_and_unchanged_csp(brand_client: TestClient) -> None:
    response = brand_client.get("/manifest.json")

    assert response.status_code == 200
    assert response.headers["content-type"].split(";")[0] == "application/json"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["content-security-policy"] == CSP


@pytest.mark.parametrize(
    ("path", "mime"),
    [
        ("/og.png", "image/png"),
        ("/apple-touch-icon.png", "image/png"),
        ("/favicon.svg", "image/svg+xml"),
        ("/hero.webp", "image/webp"),
    ],
)
def test_brand_files_have_their_mime_type(brand_client: TestClient, path: str, mime: str) -> None:
    response = brand_client.get(path)

    assert response.status_code == 200
    assert response.headers["content-type"].split(";")[0] == mime


def test_woff2_asset_is_font_with_immutable_cache(brand_client: TestClient) -> None:
    response = brand_client.get("/assets/font-abc123.woff2")

    assert response.status_code == 200
    assert response.headers["content-type"].split(";")[0] == "font/woff2"
    assert response.headers["cache-control"] == IMMUTABLE
