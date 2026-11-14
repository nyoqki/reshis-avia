import hashlib
import sqlite3
from datetime import UTC, datetime, timedelta
from http.cookies import Morsel, SimpleCookie
from pathlib import Path

import pytest
from fastapi import Response
from pydantic import SecretStr
from starlette.requests import Request

from rehis.auth.demo import seed_demo_user
from rehis.auth.deps import current_user
from rehis.auth.passwords import (
    burn_verification_time,
    hash_password,
    needs_rehash,
    verify_password,
)
from rehis.auth.sessions import (
    SESSION_COOKIE,
    end_session,
    hash_token,
    new_token,
    start_session,
)
from rehis.config import Settings
from rehis.db import (
    connect,
    count_users,
    create_session,
    create_user,
    get_user_by_username,
    migrate,
)
from rehis.errors import ApiError
from rehis.main import create_app

UNAUTHORIZED = "Войдите, чтобы продолжить"


@pytest.fixture
def conn(tmp_path: Path) -> sqlite3.Connection:
    connection = connect(tmp_path / "auth.sqlite3")
    migrate(connection)
    return connection


def make_request(cookie: str | None = None) -> Request:
    headers: list[tuple[bytes, bytes]] = []
    if cookie is not None:
        headers.append((b"cookie", f"{SESSION_COOKIE}={cookie}".encode()))
    return Request({"type": "http", "method": "GET", "path": "/", "headers": headers})


def session_cookie(response: Response) -> Morsel[str]:
    cookie: SimpleCookie = SimpleCookie()
    for header in response.headers.getlist("set-cookie"):
        cookie.load(header)
    return cookie[SESSION_COOKIE]


def session_hashes(conn: sqlite3.Connection) -> list[str]:
    return [r["token_hash"] for r in conn.execute("SELECT token_hash FROM sessions")]


def test_hash_password_is_argon2id_and_verifies() -> None:
    password_hash = hash_password("correct horse")
    assert password_hash.startswith("$argon2id$")
    assert "correct horse" not in password_hash
    assert verify_password(password_hash, "correct horse") is True
    assert verify_password(password_hash, "wrong horse") is False
    assert needs_rehash(password_hash) is False


def test_hash_password_is_salted() -> None:
    assert hash_password("same") != hash_password("same")


@pytest.mark.parametrize("garbage", ["", "not-a-hash", "$argon2id$broken", "$2b$12$abc"])
def test_verify_password_false_for_garbage_hash(garbage: str) -> None:
    assert verify_password(garbage, "anything") is False


def test_burn_verification_time_returns_none() -> None:
    burn_verification_time("whatever")


def test_tokens_are_random_and_hash_is_sha256_hex() -> None:
    first, second = new_token(), new_token()
    assert first != second
    assert len(first) >= 43
    assert hash_token(first) == hashlib.sha256(first.encode()).hexdigest()


def test_start_session_sets_cookie_attributes(conn: sqlite3.Connection) -> None:
    user = create_user(conn, "alice", hash_password("pw-12345678"))
    response = Response()
    before = datetime.now(UTC)
    start_session(conn, response, user, Settings(cookie_secure=True))
    cookie = session_cookie(response)
    assert cookie.value
    assert cookie["httponly"] is True
    assert cookie["samesite"].lower() == "lax"
    assert cookie["path"] == "/"
    assert cookie["max-age"] == "604800"
    assert cookie["secure"] is True

    # The database holds only the hash of the token, never the token itself.
    assert session_hashes(conn) == [hash_token(cookie.value)]
    row = conn.execute("SELECT user_id, expires_at FROM sessions").fetchone()
    assert row["user_id"] == user.id
    expires_at = datetime.fromisoformat(row["expires_at"])
    assert abs(expires_at - (before + timedelta(hours=168))) < timedelta(minutes=1)


def test_start_session_cookie_not_secure_when_disabled(conn: sqlite3.Connection) -> None:
    user = create_user(conn, "alice", hash_password("pw-12345678"))
    response = Response()
    start_session(conn, response, user, Settings(cookie_secure=False, session_ttl_hours=1))
    cookie = session_cookie(response)
    assert not cookie["secure"]
    assert cookie["httponly"] is True
    assert cookie["max-age"] == "3600"


def test_start_session_deletes_expired_sessions(conn: sqlite3.Connection) -> None:
    user = create_user(conn, "alice", hash_password("pw-12345678"))
    now = datetime.now(UTC)
    create_session(conn, user.id, "stale", now - timedelta(hours=1))
    create_session(conn, user.id, "live", now + timedelta(hours=1))
    start_session(conn, Response(), user, Settings(cookie_secure=False))
    hashes = session_hashes(conn)
    assert "stale" not in hashes
    assert "live" in hashes
    assert len(hashes) == 2


def test_current_user_returns_user_for_valid_session(conn: sqlite3.Connection) -> None:
    user = create_user(conn, "alice", hash_password("pw-12345678"))
    response = Response()
    start_session(conn, response, user, Settings(cookie_secure=False))
    token = session_cookie(response).value
    assert current_user(make_request(token), conn).id == user.id


def test_current_user_401_without_cookie(conn: sqlite3.Connection) -> None:
    with pytest.raises(ApiError) as excinfo:
        current_user(make_request(), conn)
    assert excinfo.value.status_code == 401
    assert excinfo.value.detail == UNAUTHORIZED


def test_current_user_401_for_unknown_token(conn: sqlite3.Connection) -> None:
    with pytest.raises(ApiError) as excinfo:
        current_user(make_request(new_token()), conn)
    assert excinfo.value.status_code == 401
    assert excinfo.value.detail == UNAUTHORIZED


def test_current_user_401_for_expired_session(conn: sqlite3.Connection) -> None:
    user = create_user(conn, "alice", hash_password("pw-12345678"))
    token = new_token()
    create_session(conn, user.id, hash_token(token), datetime.now(UTC) - timedelta(seconds=1))
    with pytest.raises(ApiError) as excinfo:
        current_user(make_request(token), conn)
    assert excinfo.value.status_code == 401
    assert excinfo.value.detail == UNAUTHORIZED


def test_end_session_deletes_row_and_clears_cookie(conn: sqlite3.Connection) -> None:
    settings = Settings(cookie_secure=True)
    user = create_user(conn, "alice", hash_password("pw-12345678"))
    other = create_user(conn, "bob", hash_password("pw-12345678"))
    started = Response()
    start_session(conn, started, user, settings)
    start_session(conn, Response(), other, settings)
    token = session_cookie(started).value

    response = Response()
    end_session(conn, make_request(token), response, settings)

    assert hash_token(token) not in session_hashes(conn)
    assert len(session_hashes(conn)) == 1
    cleared = session_cookie(response)
    assert cleared.value == ""
    assert cleared["max-age"] == "0"
    assert cleared["path"] == "/"
    assert cleared["httponly"] is True
    assert cleared["samesite"].lower() == "lax"
    assert cleared["secure"] is True
    with pytest.raises(ApiError) as excinfo:
        current_user(make_request(token), conn)
    assert excinfo.value.status_code == 401


def test_end_session_without_cookie_still_clears(conn: sqlite3.Connection) -> None:
    settings = Settings(cookie_secure=False)
    response = Response()
    end_session(conn, make_request(), response, settings)
    assert session_cookie(response)["max-age"] == "0"


def test_seed_demo_user_creates_demo_user(conn: sqlite3.Connection) -> None:
    settings = Settings(demo_username="demo", demo_password=SecretStr("demo-pass-123"))
    seed_demo_user(conn, settings)
    user = get_user_by_username(conn, "demo")
    assert user is not None
    assert user.is_demo is True
    assert verify_password(user.password_hash, "demo-pass-123")


def test_seed_demo_user_is_idempotent(conn: sqlite3.Connection) -> None:
    settings = Settings(demo_username="demo", demo_password=SecretStr("demo-pass-123"))
    seed_demo_user(conn, settings)
    first = get_user_by_username(conn, "demo")
    seed_demo_user(conn, settings)
    second = get_user_by_username(conn, "demo")
    assert first is not None
    assert second is not None
    assert count_users(conn, include_demo=True) == 1
    assert second.id == first.id
    assert second.password_hash == first.password_hash


def test_seed_demo_user_updates_hash_when_password_changes(conn: sqlite3.Connection) -> None:
    seed_demo_user(conn, Settings(demo_username="demo", demo_password=SecretStr("old-pass-123")))
    seed_demo_user(conn, Settings(demo_username="demo", demo_password=SecretStr("new-pass-456")))
    user = get_user_by_username(conn, "demo")
    assert user is not None
    assert count_users(conn, include_demo=True) == 1
    assert verify_password(user.password_hash, "new-pass-456")
    assert not verify_password(user.password_hash, "old-pass-123")


@pytest.mark.parametrize("registered_as", ["demo", "Demo"])
def test_seed_demo_user_never_takes_over_a_regular_account(
    conn: sqlite3.Connection, registered_as: str
) -> None:
    original_hash = hash_password("owner-pass-123")
    create_user(conn, registered_as, original_hash)
    seed_demo_user(conn, Settings(demo_username="demo", demo_password=SecretStr("demo-pass-123")))
    user = get_user_by_username(conn, "demo")
    assert user is not None
    assert user.is_demo is False
    assert user.password_hash == original_hash
    assert count_users(conn, include_demo=True) == 1


def test_seed_demo_user_does_not_convert_regular_account_with_same_password(
    conn: sqlite3.Connection,
) -> None:
    create_user(conn, "demo", hash_password("demo-pass-123"))
    seed_demo_user(conn, Settings(demo_username="demo", demo_password=SecretStr("demo-pass-123")))
    user = get_user_by_username(conn, "demo")
    assert user is not None
    assert user.is_demo is False


@pytest.mark.parametrize(
    "settings",
    [
        Settings(demo_username=None, demo_password=None),
        Settings(demo_username="demo", demo_password=None),
        Settings(demo_username=None, demo_password=SecretStr("demo-pass-123")),
    ],
)
def test_seed_demo_user_noop_without_full_config(
    conn: sqlite3.Connection, settings: Settings
) -> None:
    seed_demo_user(conn, settings)
    assert count_users(conn, include_demo=True) == 0


def test_create_app_creates_schema_and_seeds_demo(settings: Settings) -> None:
    assert not settings.db_path.exists()
    create_app(settings)
    check = connect(settings.db_path)
    try:
        tables = {r["name"] for r in check.execute("SELECT name FROM sqlite_master")}
        assert {"users", "sessions", "calculations"} <= tables
        demo = get_user_by_username(check, "demo")
        assert demo is not None
        assert demo.is_demo is True
        assert verify_password(demo.password_hash, "demo-pass-123")
    finally:
        check.close()


def test_create_app_twice_keeps_single_demo_user(settings: Settings) -> None:
    create_app(settings)
    create_app(settings)
    check = connect(settings.db_path)
    try:
        assert count_users(check, include_demo=True) == 1
    finally:
        check.close()
