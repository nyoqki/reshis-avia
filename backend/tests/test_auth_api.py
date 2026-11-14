import threading
from collections.abc import Callable, Iterator

import pytest
from argon2 import PasswordHasher
from fastapi.testclient import TestClient

from rehis.auth.passwords import hash_password, needs_rehash, verify_password
from rehis.auth.schemas import AuthOptions, UserOut
from rehis.auth.sessions import SESSION_COOKIE
from rehis.config import Settings
from rehis.db import connect, create_user, get_user_by_username
from rehis.main import create_app

PASSWORD = "correct-horse-1"
CLOSED_DETAIL = "Регистрация закрыта"
BAD_LOGIN_DETAIL = "Неверное имя пользователя или пароль"
TAKEN_DETAIL = "Это имя уже занято"
DEMO_OFF_DETAIL = "Демо-доступ отключён"

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


def register(client: TestClient, username: str = "alice", password: str = PASSWORD) -> None:
    response = client.post("/api/auth/register", json={"username": username, "password": password})
    assert response.status_code == 201, response.text


def test_register_creates_user_and_logs_in(client: TestClient) -> None:
    response = client.post("/api/auth/register", json={"username": "alice", "password": PASSWORD})

    assert response.status_code == 201
    user = UserOut.model_validate(response.json())
    assert user.username == "alice"
    assert user.is_demo is False
    assert SESSION_COOKIE in client.cookies
    me = client.get("/api/me")
    assert me.status_code == 200
    assert me.json() == {"username": "alice", "is_demo": False}
    assert PASSWORD not in response.text


def test_register_duplicate_name_in_other_case_is_409(client: TestClient) -> None:
    register(client, "Alice")
    other = TestClient(client.app)

    response = other.post("/api/auth/register", json={"username": "aLICE", "password": PASSWORD})

    assert response.status_code == 409
    assert response.json()["detail"] == TAKEN_DETAIL


@pytest.mark.parametrize(
    ("body", "field"),
    [
        ({"username": "alice", "password": "short"}, "password"),
        ({"username": "alice", "password": "x" * 129}, "password"),
        ({"username": "bad name!", "password": PASSWORD}, "username"),
        ({"username": "ab", "password": PASSWORD}, "username"),
        ({"username": "a" * 33, "password": PASSWORD}, "username"),
        ({"username": "alice", "password": PASSWORD, "admin": True}, "admin"),
    ],
)
def test_register_invalid_input_is_422_with_fields(
    client: TestClient, body: dict[str, object], field: str
) -> None:
    response = client.post("/api/auth/register", json=body)

    assert response.status_code == 422
    fields = response.json()["fields"]
    assert field in fields
    assert fields[field]


def test_login_with_correct_password(client: TestClient) -> None:
    register(client, "alice")
    other = TestClient(client.app)

    response = other.post("/api/auth/login", json={"username": "alice", "password": PASSWORD})

    assert response.status_code == 200
    assert UserOut.model_validate(response.json()).username == "alice"
    assert other.get("/api/me").status_code == 200


def test_login_wrong_password_and_unknown_user_are_indistinguishable(client: TestClient) -> None:
    register(client, "alice")
    other = TestClient(client.app)

    wrong = other.post("/api/auth/login", json={"username": "alice", "password": "wrong-password"})
    unknown = other.post(
        "/api/auth/login", json={"username": "nobody", "password": "wrong-password"}
    )
    malformed = other.post("/api/auth/login", json={"username": "no body!", "password": "x"})

    assert wrong.status_code == unknown.status_code == malformed.status_code == 401
    assert wrong.json() == unknown.json() == malformed.json()
    assert wrong.json()["detail"] == BAD_LOGIN_DETAIL
    assert SESSION_COOKIE not in other.cookies


def test_login_rotates_the_session(client: TestClient) -> None:
    register(client, "alice")
    old_token = client.cookies[SESSION_COOKIE]

    response = client.post("/api/auth/login", json={"username": "alice", "password": PASSWORD})

    assert response.status_code == 200
    new_token = client.cookies[SESSION_COOKIE]
    assert new_token != old_token
    replay = TestClient(client.app)
    replay.cookies.set(SESSION_COOKIE, old_token)
    assert replay.get("/api/me").status_code == 401
    assert client.get("/api/me").status_code == 200


def test_eleventh_login_from_one_ip_is_429_with_retry_after(client: TestClient) -> None:
    for i in range(10):
        response = client.post(
            "/api/auth/login", json={"username": f"user{i}", "password": "wrong-password"}
        )
        assert response.status_code == 401

    response = client.post(
        "/api/auth/login", json={"username": "user99", "password": "wrong-password"}
    )

    assert response.status_code == 429
    assert int(response.headers["Retry-After"]) >= 1
    assert response.json()["detail"]


def test_eleventh_login_for_one_username_is_429(client: TestClient) -> None:
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
    conn = connect(settings.db_path)
    try:
        create_user(conn, "alice", weak_hash)
    finally:
        conn.close()

    assert (
        client.post("/api/auth/login", json={"username": "alice", "password": PASSWORD}).status_code
        == 200
    )

    conn = connect(settings.db_path)
    try:
        user = get_user_by_username(conn, "alice")
    finally:
        conn.close()
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


def test_sixth_registration_from_one_ip_is_429(client: TestClient) -> None:
    for i in range(5):
        register(client, f"user{i}")

    response = client.post("/api/auth/register", json={"username": "user5", "password": PASSWORD})

    assert response.status_code == 429
    assert int(response.headers["Retry-After"]) >= 1


def test_demo_login(client: TestClient) -> None:
    response = client.post("/api/auth/demo")

    assert response.status_code == 200
    user = UserOut.model_validate(response.json())
    assert user.username == "demo"
    assert user.is_demo is True
    me = client.get("/api/me")
    assert me.status_code == 200
    assert me.json()["is_demo"] is True
    options = AuthOptions.model_validate(client.get("/api/auth/options").json())
    assert options.demo_enabled is True


def test_demo_login_when_not_configured_is_404(make_client: MakeClient) -> None:
    client = make_client(demo_username=None, demo_password=None)

    response = client.post("/api/auth/demo")

    assert response.status_code == 404
    assert response.json()["detail"] == DEMO_OFF_DETAIL
    assert SESSION_COOKIE not in client.cookies
    options = AuthOptions.model_validate(client.get("/api/auth/options").json())
    assert options.demo_enabled is False


def test_logout_ends_the_session(client: TestClient) -> None:
    register(client, "alice")
    token = client.cookies[SESSION_COOKIE]

    response = client.post("/api/auth/logout")

    assert response.status_code == 204
    assert SESSION_COOKIE in response.headers["set-cookie"]
    assert SESSION_COOKIE not in client.cookies
    replay = TestClient(client.app)
    replay.cookies.set(SESSION_COOKIE, token)
    assert replay.get("/api/me").status_code == 401


def test_logout_without_session_is_204(client: TestClient) -> None:
    assert client.post("/api/auth/logout").status_code == 204


def test_me_without_cookie_is_401_with_russian_detail(client: TestClient) -> None:
    response = client.get("/api/me")

    assert response.status_code == 401
    assert response.json()["detail"] == "Войдите, чтобы продолжить"


def test_login_with_foreign_origin_is_403(client: TestClient) -> None:
    register(client, "alice")
    other = TestClient(client.app)

    response = other.post(
        "/api/auth/login",
        json={"username": "alice", "password": PASSWORD},
        headers={"Origin": "https://evil.example"},
    )

    assert response.status_code == 403
    assert SESSION_COOKIE not in other.cookies


def test_registration_closed_by_setting(make_client: MakeClient) -> None:
    client = make_client(registration_open=False)

    response = client.post("/api/auth/register", json={"username": "alice", "password": PASSWORD})

    assert response.status_code == 403
    assert response.json()["detail"] == CLOSED_DETAIL
    options = AuthOptions.model_validate(client.get("/api/auth/options").json())
    assert options.registration_open is False


def test_registration_closed_at_max_users(make_client: MakeClient) -> None:
    client = make_client(max_users=1)
    options = AuthOptions.model_validate(client.get("/api/auth/options").json())
    assert options.registration_open is True
    register(client, "alice")

    response = TestClient(client.app).post(
        "/api/auth/register", json={"username": "bob", "password": PASSWORD}
    )

    assert response.status_code == 403
    assert response.json()["detail"] == CLOSED_DETAIL
    options = AuthOptions.model_validate(client.get("/api/auth/options").json())
    assert options.registration_open is False


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


def test_options_defaults(client: TestClient) -> None:
    response = client.get("/api/auth/options")

    assert response.status_code == 200
    assert response.json() == {"demo_enabled": True, "registration_open": True}


def test_demo_user_does_not_count_towards_max_users(make_client: MakeClient) -> None:
    client = make_client(max_users=1)

    assert client.post("/api/auth/demo").status_code == 200
    client.post("/api/auth/logout")
    response = client.post("/api/auth/register", json={"username": "alice", "password": PASSWORD})

    assert response.status_code == 201
