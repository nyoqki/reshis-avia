import sqlite3
import threading
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import pytest

from rehis import db
from rehis.db import (
    HISTORY_KEEP,
    HISTORY_LIMIT,
    NewCalculation,
    UsernameTakenError,
    add_calculation,
    connect,
    count_users,
    create_session,
    create_user,
    delete_expired_sessions,
    delete_session,
    get_session_user,
    get_user_by_id,
    get_user_by_username,
    list_calculations,
    migrate,
    update_user,
)

NOW = datetime(2026, 6, 1, 12, 0, tzinfo=UTC)


@pytest.fixture
def conn(tmp_path: Path) -> sqlite3.Connection:
    connection = connect(tmp_path / "sub" / "test.sqlite3")
    migrate(connection)
    return connection


def make_calc(n: int = 0) -> NewCalculation:
    return NewCalculation(
        route="SVO-LED",
        origin="SVO",
        destination="LED",
        flight_date=date(2026, 7, 1),
        price=5000 + n,
        seats=100,
        wants=80,
        buys=60,
    )


def user_version(c: sqlite3.Connection) -> int:
    row = c.execute("PRAGMA user_version").fetchone()
    return int(row[0])


def table_names(c: sqlite3.Connection) -> set[str]:
    rows = c.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
    return {r["name"] for r in rows}


def test_migrate_creates_schema_and_is_idempotent(tmp_path: Path) -> None:
    c = connect(tmp_path / "new" / "db.sqlite3")
    assert user_version(c) == 0
    migrate(c)
    assert user_version(c) == 1
    assert {"users", "sessions", "calculations"} <= table_names(c)
    migrate(c)
    assert user_version(c) == 1
    c.close()


def test_connect_sets_row_factory_and_foreign_keys(tmp_path: Path) -> None:
    c = connect(tmp_path / "x" / "db.sqlite3")
    assert c.row_factory is sqlite3.Row
    assert c.execute("PRAGMA foreign_keys").fetchone()[0] == 1
    c.close()


def test_duplicate_username_any_case_raises(conn: sqlite3.Connection) -> None:
    user = create_user(conn, "Alice", "hash")
    assert user.username == "Alice"
    assert user.is_demo is False
    with pytest.raises(UsernameTakenError):
        create_user(conn, "aLICE", "hash2")
    assert count_users(conn) == 1


def test_get_user_lookups(conn: sqlite3.Connection) -> None:
    user = create_user(conn, "Alice", "hash")
    assert get_user_by_username(conn, "ALICE") == user
    assert get_user_by_id(conn, user.id) == user
    assert get_user_by_username(conn, "bob") is None
    assert get_user_by_id(conn, user.id + 1) is None
    assert user.created_at.tzinfo is not None


def test_update_user(conn: sqlite3.Connection) -> None:
    user = create_user(conn, "alice", "old")
    update_user(conn, user.id, password_hash="new")
    updated = get_user_by_id(conn, user.id)
    assert updated is not None
    assert updated.password_hash == "new"
    assert updated.is_demo is False
    update_user(conn, user.id, is_demo=True)
    updated = get_user_by_id(conn, user.id)
    assert updated is not None
    assert updated.password_hash == "new"
    assert updated.is_demo is True


def test_session_expiry_and_cleanup(conn: sqlite3.Connection) -> None:
    user = create_user(conn, "alice", "h")
    create_session(conn, user.id, "live", NOW + timedelta(hours=1))
    create_session(conn, user.id, "edge", NOW)
    create_session(conn, user.id, "dead", NOW - timedelta(hours=1))

    assert get_session_user(conn, "live", NOW) == user
    assert get_session_user(conn, "edge", NOW - timedelta(seconds=1)) == user
    assert get_session_user(conn, "edge", NOW) is None
    assert get_session_user(conn, "dead", NOW) is None
    assert get_session_user(conn, "missing", NOW) is None

    assert delete_expired_sessions(conn, NOW) == 2
    assert get_session_user(conn, "live", NOW) == user
    assert delete_expired_sessions(conn, NOW) == 0


def test_delete_session(conn: sqlite3.Connection) -> None:
    user = create_user(conn, "alice", "h")
    create_session(conn, user.id, "tok", NOW + timedelta(hours=1))
    assert get_session_user(conn, "tok", NOW) == user
    delete_session(conn, "tok")
    assert get_session_user(conn, "tok", NOW) is None


def test_list_calculations_scoped_newest_first_and_capped(conn: sqlite3.Connection) -> None:
    alice = create_user(conn, "alice", "h")
    bob = create_user(conn, "bob", "h")
    ids = [add_calculation(conn, alice.id, make_calc(n)) for n in range(HISTORY_LIMIT + 5)]
    bob_id = add_calculation(conn, bob.id, make_calc(999))

    rows = list_calculations(conn, alice.id)
    assert len(rows) == HISTORY_LIMIT == 50
    assert [r.id for r in rows] == sorted(ids, reverse=True)[:HISTORY_LIMIT]
    assert all(r.price != 5999 for r in rows)
    assert rows[0].price == 5000 + HISTORY_LIMIT + 4
    assert rows[0].flight_date == date(2026, 7, 1)
    assert rows[0].created_at.tzinfo is not None
    assert len(list_calculations(conn, alice.id, limit=3)) == 3
    assert [r.id for r in list_calculations(conn, bob.id)] == [bob_id]


def test_add_calculation_trims_per_user(conn: sqlite3.Connection) -> None:
    alice = create_user(conn, "alice", "h")
    bob = create_user(conn, "bob", "h")
    for n in range(10):
        add_calculation(conn, bob.id, make_calc(n))
    ids = [add_calculation(conn, alice.id, make_calc(n)) for n in range(HISTORY_KEEP + 7)]

    assert HISTORY_KEEP == 100
    count = conn.execute(
        "SELECT COUNT(*) FROM calculations WHERE user_id = ?", (alice.id,)
    ).fetchone()[0]
    assert count == HISTORY_KEEP
    kept = {r.id for r in list_calculations(conn, alice.id, limit=1000)}
    assert kept == set(ids[-HISTORY_KEEP:])
    assert len(list_calculations(conn, bob.id, limit=1000)) == 10


def test_deleting_user_cascades(conn: sqlite3.Connection) -> None:
    user = create_user(conn, "alice", "h")
    other = create_user(conn, "bob", "h")
    create_session(conn, user.id, "tok", NOW + timedelta(hours=1))
    create_session(conn, other.id, "tok2", NOW + timedelta(hours=1))
    add_calculation(conn, user.id, make_calc())
    add_calculation(conn, other.id, make_calc())

    with conn:
        conn.execute("DELETE FROM users WHERE id = ?", (user.id,))

    assert get_session_user(conn, "tok", NOW) is None
    assert list_calculations(conn, user.id) == []
    assert get_session_user(conn, "tok2", NOW) == other
    assert len(list_calculations(conn, other.id)) == 1


def test_failed_migration_rolls_back_and_can_be_retried(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    c = connect(tmp_path / "db.sqlite3")
    good = list(db.MIGRATIONS)
    assert len(good) >= 1
    first = good[0]
    broken = [first, "CREATE TABLE extra(id INTEGER PRIMARY KEY); THIS IS NOT SQL;"]
    fixed = [first, "CREATE TABLE extra(id INTEGER PRIMARY KEY);"]

    monkeypatch.setattr(db, "MIGRATIONS", broken)
    with pytest.raises(sqlite3.Error):
        migrate(c)
    assert user_version(c) == 1
    assert "extra" not in table_names(c)
    assert "users" in table_names(c)

    monkeypatch.setattr(db, "MIGRATIONS", fixed)
    migrate(c)
    assert user_version(c) == 2
    assert "extra" in table_names(c)
    c.close()


def test_connection_usable_across_threads(conn: sqlite3.Connection) -> None:
    create_user(conn, "alice", "h")
    result: list[int] = []
    errors: list[BaseException] = []

    def work() -> None:
        try:
            result.append(count_users(conn))
            conn.close()
        except BaseException as exc:
            errors.append(exc)

    t = threading.Thread(target=work)
    t.start()
    t.join()
    assert errors == []
    assert result == [1]


def test_count_users_excludes_demo_by_default(conn: sqlite3.Connection) -> None:
    create_user(conn, "alice", "h")
    create_user(conn, "demo", "h", is_demo=True)
    assert count_users(conn) == 1
    assert count_users(conn, include_demo=True) == 2
