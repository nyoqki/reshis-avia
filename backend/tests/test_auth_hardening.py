"""Regression tests for review findings on auth: limits, rehash, the user cap and demo seeding."""

import sqlite3
import threading
import time
from collections.abc import Callable, Iterator
from pathlib import Path

import pytest
from argon2 import PasswordHasher
from fastapi.testclient import TestClient
from pydantic import SecretStr

from rehis.auth import passwords
from rehis.auth.demo import seed_demo_user
from rehis.auth.passwords import hash_password, needs_rehash, verify_password
from rehis.auth.schemas import AuthOptions
from rehis.config import Settings
from rehis.db import connect, count_users, create_user, get_user_by_username, migrate
from rehis.main import create_app

PASSWORD = "correct-horse-1"

MakeClient = Callable[..., TestClient]


@pytest.fixture
def make_client(settings: Settings) -> Iterator[MakeClient]:
    """Build a client on a fresh app (fresh limiters and database) with settings overrides."""
    clients: list[TestClient] = []

    def factory(**overrides: object) -> TestClient:
        test_client = TestClient(create_app(settings.model_copy(update=overrides)))
        test_client.__enter__()
        clients.append(test_client)
        return test_client

    yield factory
    for test_client in clients:
        test_client.__exit__(None, None, None)


@pytest.fixture
def conn(tmp_path: Path) -> Iterator[sqlite3.Connection]:
    connection = connect(tmp_path / "seed.sqlite3")
    migrate(connection)
    try:
        yield connection
    finally:
        connection.close()


def test_eleventh_login_for_one_username_is_429_across_ips_and_spellings(
    client: TestClient,
) -> None:
    def from_ip(n: int) -> TestClient:
        # A distinct client address per request keeps the per-IP limiter out of the way.
        return TestClient(client.app, client=(f"203.0.113.{n}", 50000))

    spellings = ["Alice", "ALICE", "alice", "aLiCe", "AlIcE"]
    for i in range(10):
        response = from_ip(i).post(
            "/api/auth/login", json={"username": spellings[i % 5], "password": "wrong-password"}
        )
        assert response.status_code == 401

    response = from_ip(10).post(
        "/api/auth/login", json={"username": "alice", "password": "wrong-password"}
    )

    assert response.status_code == 429
    assert "Retry-After" in response.headers
    other = from_ip(11).post(
        "/api/auth/login", json={"username": "bob", "password": "wrong-password"}
    )
    assert other.status_code == 401


def test_login_rehashes_a_password_with_outdated_parameters(
    client: TestClient, settings: Settings
) -> None:
    weak_hash = PasswordHasher(time_cost=1, memory_cost=8, parallelism=1).hash(PASSWORD)
    db = connect(settings.db_path)
    try:
        create_user(db, "alice", weak_hash)
    finally:
        db.close()

    assert (
        client.post("/api/auth/login", json={"username": "alice", "password": PASSWORD}).status_code
        == 200
    )

    db = connect(settings.db_path)
    try:
        user = get_user_by_username(db, "alice")
    finally:
        db.close()
    assert user is not None
    assert user.password_hash != weak_hash
    assert not needs_rehash(user.password_hash)
    assert verify_password(user.password_hash, PASSWORD)
    client.post("/api/auth/logout")
    assert (
        client.post("/api/auth/login", json={"username": "alice", "password": PASSWORD}).status_code
        == 200
    )


def test_thirty_first_demo_login_from_one_ip_is_429(client: TestClient) -> None:
    for _ in range(30):
        assert client.post("/api/auth/demo").status_code == 200

    response = client.post("/api/auth/demo")

    assert response.status_code == 429
    assert int(response.headers["Retry-After"]) >= 1


def test_concurrent_registrations_cannot_exceed_max_users(
    make_client: MakeClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    client = make_client(max_users=1)
    both_checked = threading.Barrier(2, timeout=5)

    def slow_hash(password: str) -> str:
        # Both requests have passed the early cap check before either inserts.
        both_checked.wait()
        return hash_password(password)

    monkeypatch.setattr("rehis.auth.router.hash_password", slow_hash)
    statuses: list[int] = []

    def attempt(name: str) -> None:
        response = TestClient(client.app).post(
            "/api/auth/register", json={"username": name, "password": PASSWORD}
        )
        statuses.append(response.status_code)

    threads = [threading.Thread(target=attempt, args=(name,)) for name in ("alice", "bob")]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert sorted(statuses) == [201, 403]
    options = AuthOptions.model_validate(client.get("/api/auth/options").json())
    assert options.registration_open is False


@pytest.mark.parametrize("registered_as", ["demo", "Demo"])
def test_seed_demo_user_never_takes_over_a_regular_account_with_its_own_password(
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


class _SlowHasher:
    """Stands in for PasswordHasher and records how many calls overlap."""

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.active = 0
        self.peak = 0

    def _work(self) -> None:
        with self.lock:
            self.active += 1
            self.peak = max(self.peak, self.active)
        time.sleep(0.05)
        with self.lock:
            self.active -= 1

    def hash(self, password: str) -> str:
        self._work()
        return "hash"

    def verify(self, password_hash: str, password: str) -> bool:
        self._work()
        return True


def test_argon2_calls_are_capped_so_a_login_burst_cannot_exhaust_memory(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # argon2id with library defaults takes 64 MiB per call, and the sync auth endpoints run in a
    # threadpool of about 40 threads: without a cap a burst of logins could claim gigabytes.
    slow = _SlowHasher()
    monkeypatch.setattr(passwords, "_hasher", slow)
    calls: list[Callable[[], object]] = [
        lambda: passwords.hash_password("p"),
        lambda: passwords.verify_password("h", "p"),
        lambda: passwords.burn_verification_time("p"),
    ] * 6
    threads = [threading.Thread(target=call) for call in calls]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert 1 < slow.peak <= passwords.MAX_CONCURRENT_HASHES
