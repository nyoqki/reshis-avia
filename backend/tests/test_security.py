import re
from ipaddress import ip_network
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.requests import Request
from starlette.responses import Response

from rehis.config import Settings
from rehis.errors import ApiError
from rehis.security.net import client_ip, parse_networks

ORIGIN = {"Origin": "http://testserver"}


def _add_routes(app: FastAPI) -> None:
    def ok() -> dict[str, bool]:
        return {"ok": True}

    def boom() -> None:
        raise RuntimeError("boom")

    def limited() -> None:
        raise ApiError(
            429, "Слишком много попыток. Попробуйте через 1 мин.", headers={"Retry-After": "60"}
        )

    app.add_api_route("/api/_test/post", ok, methods=["POST"])
    app.add_api_route("/api/_test/boom", boom, methods=["GET"])
    app.add_api_route("/api/_test/limited", limited, methods=["GET"])


def _assert_security_headers(response: Response) -> None:
    headers = response.headers
    assert headers["x-content-type-options"] == "nosniff"
    assert headers["x-frame-options"] == "DENY"
    assert headers["referrer-policy"] == "same-origin"
    assert "frame-ancestors 'none'" in headers["content-security-policy"]


def test_foreign_origin_post_is_403(app: FastAPI) -> None:
    _add_routes(app)
    client = TestClient(app)

    response = client.post("/api/_test/post", json={}, headers={"Origin": "http://evil.example"})

    assert response.status_code == 403
    assert response.json() == {"detail": "Запрос отклонён: недопустимый источник"}


def test_allowed_origin_post_passes(app: FastAPI) -> None:
    _add_routes(app)

    response = TestClient(app).post("/api/_test/post", json={}, headers=ORIGIN)

    assert response.status_code == 200


def test_post_without_origin_passes(app: FastAPI) -> None:
    _add_routes(app)

    response = TestClient(app).post("/api/_test/post", json={})

    assert response.status_code == 200


@pytest.mark.parametrize(
    ("kwargs"),
    [
        {"content": "a=b", "headers": {**ORIGIN, "Content-Type": "text/plain"}},
        {"data": {"a": "b"}, "headers": ORIGIN},
    ],
)
def test_non_json_body_is_415(app: FastAPI, kwargs: dict[str, Any]) -> None:
    _add_routes(app)

    response = TestClient(app).post("/api/_test/post", **kwargs)

    assert response.status_code == 415
    assert response.json() == {"detail": "Отправляйте данные в формате JSON"}


def test_empty_post_without_content_type_is_allowed(app: FastAPI) -> None:
    _add_routes(app)

    response = TestClient(app).post("/api/_test/post", headers=ORIGIN)

    assert response.status_code == 200


def test_unknown_host_is_400(client: TestClient) -> None:
    response = client.get("/api/health", headers={"Host": "evil.example"})

    assert response.status_code == 400


def test_health_carries_security_headers(client: TestClient) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    _assert_security_headers(response)
    csp = response.headers["content-security-policy"]
    assert "default-src 'self'" in csp
    assert "script-src 'self';" in csp
    assert "object-src 'none'" in csp
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["permissions-policy"] == "camera=(), microphone=(), geolocation=()"
    assert response.headers["cross-origin-opener-policy"] == "same-origin"


def test_hsts_only_when_cookie_secure(app: FastAPI, settings: Settings) -> None:
    from rehis.main import create_app

    assert "strict-transport-security" not in TestClient(app).get("/api/health").headers

    secure = create_app(settings.model_copy(update={"cookie_secure": True}))
    header = TestClient(secure).get("/api/health").headers["strict-transport-security"]
    assert "max-age=31536000" in header


def test_docs_page_is_self_contained(client: TestClient) -> None:
    response = client.get("/docs")

    assert response.status_code == 200
    html = response.text
    assert "https://" not in html and "http://" not in html
    assets = re.findall(r'(?:src|href)="(/docs-assets/[^"]+)"', html)
    assert assets
    for path in assets:
        assert client.get(path).status_code == 200
    csp = response.headers["content-security-policy"]
    assert "https:" not in csp
    assert "script-src 'self' 'unsafe-inline'" in csp


def test_redoc_is_not_served(client: TestClient) -> None:
    assert client.get("/redoc").status_code == 404


def test_openapi_json_is_served(client: TestClient) -> None:
    assert client.get("/openapi.json").status_code == 200


@pytest.mark.parametrize("path", ["/api/health", "/api/nope"])
def test_cache_control_no_store_on_api_responses(client: TestClient, path: str) -> None:
    assert client.get(path).headers["cache-control"] == "no-store"


def test_headers_on_error_responses(app: FastAPI) -> None:
    _add_routes(app)
    client = TestClient(app, raise_server_exceptions=False)

    responses = {
        400: client.get("/api/health", headers={"Host": "evil.example"}),
        403: client.post("/api/_test/post", json={}, headers={"Origin": "http://evil.example"}),
        415: client.post(
            "/api/_test/post", content="x", headers={**ORIGIN, "Content-Type": "text/plain"}
        ),
        404: client.get("/api/nope"),
        422: client.post("/api/health", json={}, headers=ORIGIN),
        429: client.get("/api/_test/limited"),
        500: client.get("/api/_test/boom"),
    }

    assert responses[422].status_code in (405, 422)
    for status, response in responses.items():
        if status != 422:
            assert response.status_code == status
        _assert_security_headers(response)
        assert "default-src 'self'" in response.headers["content-security-policy"]


def test_validation_422_carries_security_headers(app: FastAPI) -> None:
    from pydantic import BaseModel

    class Body(BaseModel):
        n: int

    def take(body: Body) -> None:
        return None

    app.add_api_route("/api/_test/body", take, methods=["POST"])

    response = TestClient(app).post("/api/_test/body", json={}, headers=ORIGIN)

    assert response.status_code == 422
    _assert_security_headers(response)


def _request(peer: str | None, forwarded: str | None = None) -> Request:
    headers = [(b"x-forwarded-for", forwarded.encode())] if forwarded is not None else []
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": headers,
        "client": (peer, 1234) if peer is not None else None,
    }
    return Request(scope)


TRUSTED = parse_networks(["127.0.0.1", "10.0.0.0/8"])


def test_parse_networks_supports_single_hosts_and_cidr() -> None:
    nets = parse_networks(["127.0.0.1", "10.0.0.0/8"])

    assert ip_network("10.1.2.3/32").subnet_of(nets[1])
    assert len(nets) == 2


def test_untrusted_peer_ignores_forwarded_for() -> None:
    assert client_ip(_request("203.0.113.9", "1.2.3.4"), TRUSTED) == "203.0.113.9"


def test_trusted_peer_uses_rightmost_untrusted_address() -> None:
    request = _request("127.0.0.1", "9.9.9.9, 198.51.100.7, 10.2.3.4")

    assert client_ip(request, TRUSTED) == "198.51.100.7"


def test_trusted_peer_ignores_malformed_entries() -> None:
    request = _request("127.0.0.1", "198.51.100.7, garbage")

    assert client_ip(request, TRUSTED) == "198.51.100.7"


def test_trusted_peer_without_header_or_all_trusted_returns_peer() -> None:
    assert client_ip(_request("127.0.0.1"), TRUSTED) == "127.0.0.1"
    assert client_ip(_request("127.0.0.1", "10.0.0.5, 10.0.0.6"), TRUSTED) == "127.0.0.1"


def test_non_ip_peer_is_untrusted_and_returned_as_is() -> None:
    assert client_ip(_request("testclient", "1.2.3.4"), TRUSTED) == "testclient"


def test_missing_client_is_unknown() -> None:
    assert client_ip(_request(None, "1.2.3.4"), TRUSTED) == "unknown"
