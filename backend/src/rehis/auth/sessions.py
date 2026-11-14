"""Random session tokens stored server-side as sha256 hashes, issued in an HttpOnly cookie."""

import hashlib
import secrets
import sqlite3
from datetime import UTC, datetime, timedelta
from typing import Final

from fastapi import Request, Response

from rehis.config import Settings
from rehis.db import User, create_session, delete_expired_sessions, delete_session

SESSION_COOKIE: Final = "rehis_session"


def new_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def start_session(
    conn: sqlite3.Connection, response: Response, user: User, settings: Settings
) -> None:
    now = datetime.now(UTC)
    delete_expired_sessions(conn, now)
    token = new_token()
    ttl = timedelta(hours=settings.session_ttl_hours)
    create_session(conn, user.id, hash_token(token), now + ttl)
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=int(ttl.total_seconds()),
        path="/",
        secure=settings.cookie_secure,
        httponly=True,
        samesite="lax",
    )


def end_session(
    conn: sqlite3.Connection, request: Request, response: Response, settings: Settings
) -> None:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        delete_session(conn, hash_token(token))
    response.delete_cookie(
        SESSION_COOKIE,
        path="/",
        secure=settings.cookie_secure,
        httponly=True,
        samesite="lax",
    )
