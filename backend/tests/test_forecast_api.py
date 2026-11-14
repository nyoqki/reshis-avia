import csv
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

REPO = Path(__file__).resolve().parents[2]
FORECAST_CSV = REPO / "data" / "seasonal_forecast.csv"
PASSWORD = "correct-horse-1"

ONLY_FROM_MOSCOW = "Рейсы есть только из Москвы"
UNKNOWN_DESTINATION = (
    "Нет рейсов в этот город. Доступны: "
    "Сочи, Санкт-Петербург, Калининград, Новосибирск, Минеральные Воды"
)

Body = dict[str, object]


def trip(destination: str, day: str, price: object) -> Body:
    return {"origin": "Москва", "destination": destination, "date": day, "price": price}


def register(client: TestClient, username: str = "alice") -> None:
    response = client.post("/api/auth/register", json={"username": username, "password": PASSWORD})
    assert response.status_code == 201, response.text


def new_client(client: TestClient) -> TestClient:
    return TestClient(client.app)


@pytest.fixture
def user(client: TestClient) -> TestClient:
    register(client)
    return client


def forecast(client: TestClient, body: Body) -> dict[str, object]:
    response = client.post("/api/forecast", json=body)
    assert response.status_code == 200, response.text
    result: dict[str, object] = response.json()
    return result


def csv_row(route: str, day: str) -> dict[str, str]:
    with FORECAST_CSV.open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            if row["route"] == route and row["date"] == day:
                return row
    raise AssertionError(f"no CSV row for {route} {day}")


def test_sochi_at_base_price_sells_out(user: TestClient) -> None:
    body = forecast(user, trip("Сочи", "2026-06-12", 9000))

    assert body["route"] == "MOW-AER"
    assert body["origin"] == "Москва"
    assert body["destination"] == "Сочи"
    assert body["date"] == "2026-06-12"
    assert body["price"] == 9000
    assert body["seats"] == 900
    assert body["wants"] == 970
    assert body["buys"] == 900
    assert body["free_seats"] == 0
    assert body["limit"] == "seats"
    assert body["base_price"] == 9000
    assert body["price_min"] == 5400
    assert body["price_max"] == 18000
    assert body["price_in_range"] is True
    assert isinstance(body["history_id"], int)


def test_sochi_at_higher_price_leaves_free_seats(user: TestClient) -> None:
    body = forecast(user, trip("Сочи", "2026-06-12", 12000))

    assert body["wants"] == 547
    assert body["buys"] == 547
    assert body["free_seats"] == 353
    assert body["limit"] == "none"


def test_negative_demand_is_reported_raw_with_zero_buyers(user: TestClient) -> None:
    body = forecast(user, trip("Санкт-Петербург", "2026-06-01", 20000))

    assert body["wants_raw"] == -3120.0
    assert body["wants"] == 0
    assert body["buys"] == 0
    assert body["limit"] == "no_demand"
    assert body["price_in_range"] is False


def test_small_plane_sells_out_in_every_scenario(user: TestClient) -> None:
    body = forecast(user, trip("Новосибирск", "2026-06-20", 8000))

    assert body["buys"] == 270
    scenarios = body["scenarios"]
    assert isinstance(scenarios, list)
    assert all(item["hits_seats"] is True for item in scenarios)
    assert body["sellout"] == {"low_pct": 90, "high_pct": None}


def test_nine_scenarios_with_median_in_the_middle(user: TestClient) -> None:
    body = forecast(user, trip("Сочи", "2026-06-12", 9000))

    scenarios = body["scenarios"]
    assert isinstance(scenarios, list)
    assert len(scenarios) == 9
    assert [item["quantile"] for item in scenarios] == pytest.approx(
        [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
    )
    assert scenarios[4]["wants"] == body["wants"]
    assert set(scenarios[0]) == {"quantile", "wants", "wants_raw", "buys", "hits_seats"}


def test_sellout_bands(user: TestClient) -> None:
    at_base = forecast(user, trip("Сочи", "2026-06-12", 9000))
    pricier = forecast(user, trip("Сочи", "2026-06-12", 12000))

    assert at_base["sellout"] == {"low_pct": 70, "high_pct": 80}
    assert pricier["sellout"] == {"low_pct": None, "high_pct": 10}


def test_recommendation_matches_csv_prices(user: TestClient) -> None:
    row = csv_row("MOW-AER", "2026-06-12")
    body = forecast(user, trip("Сочи", "2026-06-12", 9000))

    recommendation = body["recommendation"]
    assert isinstance(recommendation, dict)
    assert recommendation["price"] == round(float(row["0.5_price"]))
    assert recommendation["corridor_low"] == round(float(row["0.1_price"]))
    assert recommendation["corridor_high"] == round(float(row["0.9_price"]))
    middle = float(row["0.5_price"])
    expected_pct = round((float(row["0.9_price"]) - float(row["0.1_price"])) / middle * 100)
    assert recommendation["corridor_pct"] == expected_pct
    assert recommendation["risky"] is (expected_pct >= 15)


@pytest.mark.parametrize(
    ("body", "field", "message"),
    [
        (
            {"origin": "Сочи", "destination": "Москва", "date": "2026-06-12", "price": 9000},
            "origin",
            ONLY_FROM_MOSCOW,
        ),
        (trip("Париж", "2026-06-12", 9000), "destination", UNKNOWN_DESTINATION),
        (trip("Сочи", "2026-05-31", 9000), "date", None),
        (trip("Сочи", "2026-07-02", 9000), "date", None),
        (trip("Сочи", "2026-06-12", 0), "price", None),
        (trip("Сочи", "2026-06-12", -5), "price", None),
        (trip("Сочи", "2026-06-12", 1_000_001), "price", None),
        (trip("Сочи", "2026-06-12", 9000.5), "price", None),
        (trip("Сочи", "2026-06-12", "abc"), "price", None),
        (trip("Сочи", "not-a-date", 9000), "date", None),
        ({"origin": "Москва", "destination": "Сочи", "date": "2026-06-12"}, "price", None),
        ({**trip("Сочи", "2026-06-12", 9000), "extra": 1}, "extra", None),
    ],
)
def test_invalid_trips_are_422_with_russian_field_errors(
    user: TestClient, body: Body, field: str, message: str | None
) -> None:
    response = user.post("/api/forecast", json=body)

    assert response.status_code == 422
    payload = response.json()
    assert payload["detail"]
    assert field in payload["fields"]
    assert payload["fields"][field]
    if message is not None:
        assert payload["fields"][field] == message


def test_malformed_json_is_422_not_500(user: TestClient) -> None:
    response = user.post(
        "/api/forecast", content=b"{not json", headers={"Content-Type": "application/json"}
    )

    assert response.status_code == 422
    assert response.json()["detail"]


def test_forecast_and_history_require_a_session(client: TestClient) -> None:
    assert client.post("/api/forecast", json=trip("Сочи", "2026-06-12", 9000)).status_code == 401
    assert client.get("/api/history").status_code == 401

    register(client)
    assert client.get("/api/history").json() == {"items": []}


def test_history_lists_own_entries_newest_first(user: TestClient) -> None:
    first = forecast(user, trip("Сочи", "2026-06-12", 9000))
    second = forecast(user, trip("Новосибирск", "2026-06-20", 8000))
    third = forecast(user, trip("Санкт-Петербург", "2026-06-01", 20000))

    response = user.get("/api/history")

    assert response.status_code == 200
    items = response.json()["items"]
    assert [item["id"] for item in items] == [
        third["history_id"],
        second["history_id"],
        first["history_id"],
    ]
    newest = items[0]
    assert newest["route"] == "MOW-LED"
    assert newest["origin"] == "Москва"
    assert newest["destination"] == "Санкт-Петербург"
    assert newest["date"] == "2026-06-01"
    assert newest["price"] == 20000
    assert newest["seats"] == 1440
    assert newest["wants"] == 0
    assert newest["buys"] == 0
    assert newest["created_at"]


def test_history_is_private_to_each_user(client: TestClient) -> None:
    register(client, "alice")
    forecast(client, trip("Сочи", "2026-06-12", 9000))
    bob = new_client(client)
    register(bob, "bobby")

    assert bob.get("/api/history").json() == {"items": []}
    assert len(client.get("/api/history").json()["items"]) == 1


def test_failed_forecast_adds_no_history(user: TestClient) -> None:
    response = user.post("/api/forecast", json=trip("Париж", "2026-06-12", 9000))

    assert response.status_code == 422
    assert user.get("/api/history").json() == {"items": []}


def test_history_is_capped_at_fifty_entries(user: TestClient) -> None:
    for day in range(1, 31):
        forecast(user, trip("Сочи", f"2026-06-{day:02d}", 9000))
    for day in range(1, 26):
        forecast(user, trip("Калининград", f"2026-06-{day:02d}", 5000))

    assert len(user.get("/api/history").json()["items"]) == 50


def test_sixty_first_forecast_in_a_minute_is_429(client: TestClient) -> None:
    app_client = client
    register(app_client)
    body = trip("Сочи", "2026-06-12", 9000)

    statuses = [app_client.post("/api/forecast", json=body).status_code for _ in range(61)]

    assert statuses[:60] == [200] * 60
    assert statuses[60] == 429


def test_routes_are_public_and_listed_from_the_data(client: TestClient) -> None:
    response = client.get("/api/routes")

    assert response.status_code == 200
    body = response.json()
    assert body["origin"] == "Москва"
    assert body["date_min"] == "2026-06-01"
    assert body["date_max"] == "2026-07-01"
    routes = body["routes"]
    assert [route["code"] for route in routes] == [
        "MOW-AER",
        "MOW-LED",
        "MOW-KGD",
        "MOW-OVB",
        "MOW-MRV",
    ]
    assert [route["destination"] for route in routes] == [
        "Сочи",
        "Санкт-Петербург",
        "Калининград",
        "Новосибирск",
        "Минеральные Воды",
    ]
    assert all(route["origin"] == "Москва" for route in routes)
    assert routes[0] == {
        "code": "MOW-AER",
        "origin": "Москва",
        "destination": "Сочи",
        "base_price": 9000,
        "price_min": 5400,
        "price_max": 18000,
    }
