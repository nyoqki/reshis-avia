"""SQLite data layer: connection setup, forward-only migrations and repositories."""

import sqlite3
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Final

from fastapi import Request

HISTORY_KEEP: Final = 100
HISTORY_LIMIT: Final = 50

MIGRATIONS: list[str] = [
    """
    CREATE TABLE users(
        id INTEGER PRIMARY KEY,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        is_demo INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
    );
    CREATE TABLE sessions(
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
    );
    CREATE INDEX sessions_user ON sessions(user_id);
    CREATE TABLE calculations(
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        route TEXT NOT NULL,
        origin TEXT NOT NULL,
        destination TEXT NOT NULL,
        flight_date TEXT NOT NULL,
        price INTEGER NOT NULL,
        seats INTEGER NOT NULL,
        wants INTEGER NOT NULL,
        buys INTEGER NOT NULL,
        created_at TEXT NOT NULL
    );
    CREATE INDEX calculations_user ON calculations(user_id, id DESC);
    """,
]


class UsernameTakenError(Exception):
    """A user with this username (compared case-insensitively) already exists."""


@dataclass(frozen=True)
class User:
    id: int
    username: str
    password_hash: str
    is_demo: bool
    created_at: datetime


@dataclass(frozen=True)
class NewCalculation:
    route: str
    origin: str
    destination: str
    flight_date: date
    price: int
    seats: int
    wants: int
    buys: int


@dataclass(frozen=True)
class Calculation(NewCalculation):
    id: int
    created_at: datetime


def connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    # FastAPI may run a dependency's setup, the endpoint and the teardown in different
    # threadpool workers; each connection is still used by one request at a time.
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


def get_db(request: Request) -> Iterator[sqlite3.Connection]:
    conn = connect(request.app.state.settings.db_path)
    try:
        yield conn
    finally:
        conn.close()


def _user_version(conn: sqlite3.Connection) -> int:
    return int(conn.execute("PRAGMA user_version").fetchone()[0])


def migrate(conn: sqlite3.Connection) -> None:
    current = _user_version(conn)
    if current > len(MIGRATIONS):
        raise RuntimeError(
            f"Database schema version {current} is newer than this code ({len(MIGRATIONS)})"
        )
    for version, ddl in enumerate(MIGRATIONS[current:], start=current + 1):
        # The DDL and the version bump commit together, so they never diverge.
        script = f"BEGIN;\n{ddl};\nPRAGMA user_version = {int(version)};\nCOMMIT;"
        try:
            conn.executescript(script)
        except BaseException:
            conn.rollback()
            raise


def _now() -> datetime:
    return datetime.now(UTC)


def _to_db_time(value: datetime) -> str:
    if value.tzinfo is None:
        raise ValueError("Timestamps must be timezone-aware")
    # Fixed-width UTC strings compare correctly as text.
    return value.astimezone(UTC).isoformat(timespec="microseconds")


def _user_from_row(row: sqlite3.Row) -> User:
    return User(
        id=row["id"],
        username=row["username"],
        password_hash=row["password_hash"],
        is_demo=bool(row["is_demo"]),
        created_at=datetime.fromisoformat(row["created_at"]),
    )


def _calculation_from_row(row: sqlite3.Row) -> Calculation:
    return Calculation(
        id=row["id"],
        route=row["route"],
        origin=row["origin"],
        destination=row["destination"],
        flight_date=date.fromisoformat(row["flight_date"]),
        price=row["price"],
        seats=row["seats"],
        wants=row["wants"],
        buys=row["buys"],
        created_at=datetime.fromisoformat(row["created_at"]),
    )


def create_user(
    conn: sqlite3.Connection, username: str, password_hash: str, *, is_demo: bool = False
) -> User:
    created_at = _to_db_time(_now())
    try:
        with conn:
            cursor = conn.execute(
                "INSERT INTO users (username, password_hash, is_demo, created_at)"
                " VALUES (?, ?, ?, ?)",
                (username, password_hash, int(is_demo), created_at),
            )
    except sqlite3.IntegrityError as exc:
        if exc.sqlite_errorname == "SQLITE_CONSTRAINT_UNIQUE":
            raise UsernameTakenError(username) from exc
        raise
    user_id = cursor.lastrowid
    if user_id is None:
        raise RuntimeError("SQLite did not return the new user id")
    return User(
        id=user_id,
        username=username,
        password_hash=password_hash,
        is_demo=is_demo,
        created_at=datetime.fromisoformat(created_at),
    )


def get_user_by_username(conn: sqlite3.Connection, username: str) -> User | None:
    row = conn.execute(
        "SELECT id, username, password_hash, is_demo, created_at FROM users WHERE username = ?",
        (username,),
    ).fetchone()
    return _user_from_row(row) if row is not None else None


def get_user_by_id(conn: sqlite3.Connection, user_id: int) -> User | None:
    row = conn.execute(
        "SELECT id, username, password_hash, is_demo, created_at FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()
    return _user_from_row(row) if row is not None else None


def count_users(conn: sqlite3.Connection, *, include_demo: bool = False) -> int:
    row = conn.execute(
        "SELECT COUNT(*) FROM users WHERE is_demo = 0 OR ?", (int(include_demo),)
    ).fetchone()
    return int(row[0])


def update_user(
    conn: sqlite3.Connection,
    user_id: int,
    *,
    password_hash: str | None = None,
    is_demo: bool | None = None,
) -> None:
    with conn:
        conn.execute(
            "UPDATE users SET password_hash = COALESCE(?, password_hash),"
            " is_demo = COALESCE(?, is_demo) WHERE id = ?",
            (password_hash, None if is_demo is None else int(is_demo), user_id),
        )


def create_session(
    conn: sqlite3.Connection, user_id: int, token_hash: str, expires_at: datetime
) -> None:
    with conn:
        conn.execute(
            "INSERT INTO sessions (token_hash, user_id, created_at, expires_at)"
            " VALUES (?, ?, ?, ?)",
            (token_hash, user_id, _to_db_time(_now()), _to_db_time(expires_at)),
        )


def get_session_user(conn: sqlite3.Connection, token_hash: str, now: datetime) -> User | None:
    row = conn.execute(
        "SELECT u.id, u.username, u.password_hash, u.is_demo, u.created_at"
        " FROM sessions s JOIN users u ON u.id = s.user_id"
        " WHERE s.token_hash = ? AND s.expires_at > ?",
        (token_hash, _to_db_time(now)),
    ).fetchone()
    return _user_from_row(row) if row is not None else None


def delete_session(conn: sqlite3.Connection, token_hash: str) -> None:
    with conn:
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))


def delete_expired_sessions(conn: sqlite3.Connection, now: datetime) -> int:
    with conn:
        cursor = conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (_to_db_time(now),))
    return cursor.rowcount


def add_calculation(conn: sqlite3.Connection, user_id: int, calc: NewCalculation) -> int:
    with conn:
        cursor = conn.execute(
            "INSERT INTO calculations (user_id, route, origin, destination, flight_date,"
            " price, seats, wants, buys, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                user_id,
                calc.route,
                calc.origin,
                calc.destination,
                calc.flight_date.isoformat(),
                calc.price,
                calc.seats,
                calc.wants,
                calc.buys,
                _to_db_time(_now()),
            ),
        )
        calc_id = cursor.lastrowid
        if calc_id is None:
            raise RuntimeError("SQLite did not return the new calculation id")
        conn.execute(
            "DELETE FROM calculations WHERE user_id = ? AND id NOT IN"
            " (SELECT id FROM calculations WHERE user_id = ? ORDER BY id DESC LIMIT ?)",
            (user_id, user_id, HISTORY_KEEP),
        )
    return calc_id


def list_calculations(
    conn: sqlite3.Connection, user_id: int, limit: int = HISTORY_LIMIT
) -> list[Calculation]:
    rows = conn.execute(
        "SELECT id, route, origin, destination, flight_date, price, seats, wants, buys,"
        " created_at FROM calculations WHERE user_id = ? ORDER BY id DESC LIMIT ?",
        (user_id, limit),
    ).fetchall()
    return [_calculation_from_row(row) for row in rows]
