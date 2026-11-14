import logging
from collections.abc import Iterable

from fastapi import FastAPI
from starlette.datastructures import Headers, MutableHeaders
from starlette.exceptions import HTTPException
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from rehis.config import Settings
from rehis.errors import error_response, internal_error_response
from rehis.security.net import parse_networks

logger = logging.getLogger(__name__)

UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
FOREIGN_ORIGIN_DETAIL = "Запрос отклонён: недопустимый источник"
NOT_JSON_DETAIL = "Отправляйте данные в формате JSON"
TOO_LARGE_DETAIL = "Слишком большой запрос"
# The largest legitimate body (a forecast request or credentials) is well under 1 KiB.
MAX_BODY_BYTES = 16 * 1024


def _csp(script_src: str) -> str:
    return (
        "default-src 'self'; "
        f"script-src {script_src}; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; "
        "font-src 'self'; "
        "connect-src 'self'; "
        "object-src 'none'; "
        "base-uri 'none'; "
        "form-action 'self'; "
        "frame-ancestors 'none'"
    )


CSP = _csp("'self'")
# FastAPI's Swagger UI page boots with an inline script; everything else stays same-origin.
DOCS_CSP = _csp("'self' 'unsafe-inline'")
DOCS_PATH = "/docs"

SECURITY_HEADERS: tuple[tuple[str, str], ...] = (
    ("X-Content-Type-Options", "nosniff"),
    ("Referrer-Policy", "same-origin"),
    ("X-Frame-Options", "DENY"),
    ("Permissions-Policy", "camera=(), microphone=(), geolocation=()"),
    ("Cross-Origin-Opener-Policy", "same-origin"),
)
HSTS = "max-age=31536000"


def _is_api(path: str) -> bool:
    return path == "/api" or path.startswith("/api/")


class SecurityHeadersMiddleware:
    """Outermost layer: adds security headers to every response and renders unhandled errors."""

    def __init__(self, app: ASGIApp, hsts: bool) -> None:
        self.app = app
        self.hsts = hsts

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path: str = scope["path"]
        response_started = False

        async def send_with_headers(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
                headers = MutableHeaders(raw=list(message.get("headers", [])))
                for name, value in SECURITY_HEADERS:
                    headers[name] = value
                headers["Content-Security-Policy"] = DOCS_CSP if path == DOCS_PATH else CSP
                if self.hsts:
                    headers["Strict-Transport-Security"] = HSTS
                if _is_api(path):
                    headers.setdefault("Cache-Control", "no-store")
                message["headers"] = headers.raw
            await send(message)

        try:
            await self.app(scope, receive, send_with_headers)
        except Exception:
            if response_started:
                # Too late to send an error response; let the server close the connection.
                raise
            logger.exception("Unhandled error on %s %s", scope.get("method"), path)
            await internal_error_response()(scope, receive, send_with_headers)


def _declared_length(headers: Headers) -> int:
    try:
        return int(headers.get("content-length", "0"))
    except ValueError:
        return 0


def _capped(receive: Receive) -> Receive:
    """Stop reading a streamed body once it passes MAX_BODY_BYTES."""
    received = 0

    async def capped_receive() -> Message:
        nonlocal received
        message = await receive()
        if message["type"] == "http.request":
            received += len(message.get("body", b""))
            if received > MAX_BODY_BYTES:
                # FastAPI re-raises HTTPException from body reading; the error handler renders it.
                raise HTTPException(status_code=413)
        return message

    return capped_receive


class RequestGuardMiddleware:
    """CSRF mitigation for unsafe /api requests: Origin allowlist, JSON-only, capped bodies."""

    def __init__(self, app: ASGIApp, allowed_origins: Iterable[str]) -> None:
        self.app = app
        self.allowed_origins = frozenset(origin.rstrip("/") for origin in allowed_origins)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (
            scope["type"] != "http"
            or scope["method"] not in UNSAFE_METHODS
            or not _is_api(scope["path"])
        ):
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        origin = headers.get("origin")
        if origin is not None and origin not in self.allowed_origins:
            await error_response(403, FOREIGN_ORIGIN_DETAIL)(scope, receive, send)
            return

        content_type = headers.get("content-type")
        if content_type is not None:
            if content_type.split(";", 1)[0].strip().lower() != "application/json":
                await error_response(415, NOT_JSON_DETAIL)(scope, receive, send)
                return
            if _declared_length(headers) > MAX_BODY_BYTES:
                await error_response(413, TOO_LARGE_DETAIL)(scope, receive, send)
                return
            await self.app(scope, _capped(receive), send)
            return

        # No Content-Type: allowed only with an empty body. Read the first message to check,
        # then replay it to the app.
        first = await receive()
        if first["type"] == "http.request" and (first.get("body") or first.get("more_body")):
            await error_response(415, NOT_JSON_DETAIL)(scope, receive, send)
            return
        replayed = False

        async def replay_receive() -> Message:
            nonlocal replayed
            if not replayed:
                replayed = True
                return first
            return await receive()

        await self.app(scope, replay_receive, send)


def install_security(app: FastAPI, settings: Settings) -> None:
    # Fail at startup, not per request, if REHIS_TRUSTED_PROXIES is malformed.
    parse_networks(settings.trusted_proxies)
    # add_middleware prepends, so the last one added is the outermost.
    app.add_middleware(RequestGuardMiddleware, allowed_origins=settings.allowed_origins)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts)
    app.add_middleware(SecurityHeadersMiddleware, hsts=settings.cookie_secure)
