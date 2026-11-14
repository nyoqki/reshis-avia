from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel, ConfigDict, Field

from rehis.errors import ApiError, install_error_handlers

ORIGIN = {"Origin": "http://testserver"}


class Body(BaseModel):
    model_config = ConfigDict(extra="forbid")

    price: int = Field(ge=1000, le=100000)
    name: str


def _add_routes(app: FastAPI) -> None:
    def echo(body: Body) -> dict[str, int]:
        return {"price": body.price}

    def boom() -> None:
        raise RuntimeError("secret internal detail")

    def api_error() -> None:
        raise ApiError(409, "Конфликт", fields={"name": "Уже занято"}, headers={"X-Test": "1"})

    app.add_api_route("/api/_test/echo", echo, methods=["POST"])
    app.add_api_route("/api/_test/boom", boom, methods=["GET"])
    app.add_api_route("/api/_test/conflict", api_error, methods=["GET"])


def test_missing_field_is_russian_422(app: FastAPI) -> None:
    _add_routes(app)
    client = TestClient(app)

    response = client.post("/api/_test/echo", json={"name": "x"}, headers=ORIGIN)

    assert response.status_code == 422
    body = response.json()
    assert body["detail"] == "Проверьте введённые данные"
    assert body["fields"] == {"price": "Заполните поле"}


def test_wrong_type_is_russian_422(app: FastAPI) -> None:
    _add_routes(app)
    client = TestClient(app)

    response = client.post("/api/_test/echo", json={"price": "abc", "name": "x"}, headers=ORIGIN)

    assert response.status_code == 422
    assert response.json()["fields"] == {"price": "Введите целое число"}


def test_float_price_asks_for_whole_rubles(app: FastAPI) -> None:
    _add_routes(app)
    client = TestClient(app)

    response = client.post("/api/_test/echo", json={"price": 1500.5, "name": "x"}, headers=ORIGIN)

    assert response.status_code == 422
    assert response.json()["fields"] == {"price": "Введите целое число рублей"}


def test_range_messages_use_bounds(app: FastAPI) -> None:
    _add_routes(app)
    client = TestClient(app)

    low = client.post("/api/_test/echo", json={"price": 5, "name": "x"}, headers=ORIGIN)
    high = client.post("/api/_test/echo", json={"price": 10**7, "name": "x"}, headers=ORIGIN)

    assert low.json()["fields"] == {"price": "Значение должно быть не меньше 1000"}
    assert high.json()["fields"] == {"price": "Значение должно быть не больше 100000"}


def test_extra_field_is_rejected_in_russian(app: FastAPI) -> None:
    _add_routes(app)
    client = TestClient(app)

    response = client.post(
        "/api/_test/echo", json={"price": 2000, "name": "x", "admin": True}, headers=ORIGIN
    )

    assert response.status_code == 422
    assert response.json()["fields"] == {"admin": "Лишнее поле"}


def test_malformed_json_is_russian_422(app: FastAPI) -> None:
    _add_routes(app)
    client = TestClient(app)

    response = client.post(
        "/api/_test/echo",
        content=b"{not json",
        headers={**ORIGIN, "Content-Type": "application/json"},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "\u041d\u0435 удалось прочитать запрос: неверный JSON"


def test_unhandled_exception_returns_russian_500_with_headers(app: FastAPI) -> None:
    _add_routes(app)
    client = TestClient(app, raise_server_exceptions=False)

    response = client.get("/api/_test/boom")

    assert response.status_code == 500
    assert response.json() == {"detail": "Что-то пошло не так. Попробуйте ещё раз."}
    assert "secret internal detail" not in response.text
    assert "Traceback" not in response.text
    assert response.headers["x-content-type-options"] == "nosniff"
    assert "default-src 'self'" in response.headers["content-security-policy"]


def test_unknown_api_path_is_russian_404(client: TestClient) -> None:
    response = client.get("/api/nope")

    assert response.status_code == 404
    assert response.json() == {"detail": "\u041d\u0435 найдено"}


def test_wrong_method_is_russian_405(client: TestClient) -> None:
    response = client.delete("/api/health", headers=ORIGIN)

    assert response.status_code == 405
    assert response.json() == {"detail": "Метод не поддерживается"}


def test_api_error_carries_detail_fields_and_headers(app: FastAPI) -> None:
    _add_routes(app)
    client = TestClient(app)

    response = client.get("/api/_test/conflict")

    assert response.status_code == 409
    assert response.json() == {"detail": "Конфликт", "fields": {"name": "Уже занято"}}
    assert response.headers["x-test"] == "1"


def test_api_error_without_fields_has_only_detail() -> None:
    app = FastAPI()

    install_error_handlers(app)

    def gone() -> None:
        raise ApiError(410, "Удалено")

    app.add_api_route("/api/gone", gone, methods=["GET"])

    response = TestClient(app).get("/api/gone")

    assert response.status_code == 410
    assert response.json() == {"detail": "Удалено"}
