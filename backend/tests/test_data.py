import csv
from collections.abc import Callable
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from rehis.config import Settings
from rehis.domain.data import (
    FORECAST_COLUMNS,
    ForecastData,
    ForecastSchemaError,
    load_forecast_data,
)
from rehis.main import create_app

REPO = Path(__file__).resolve().parents[2]
ROUTES = REPO / "data" / "routes.csv"
FORECAST = REPO / "data" / "seasonal_forecast.csv"
FLOAT_FORECAST = Path(__file__).parent / "fixtures" / "forecast_float.csv"

Rows = list[list[str]]


def read_rows(path: Path) -> Rows:
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.reader(f))


def write_rows(path: Path, rows: Rows) -> Path:
    with path.open("w", newline="", encoding="utf-8") as f:
        csv.writer(f).writerows(rows)
    return path


@pytest.fixture
def stub_data() -> ForecastData:
    return load_forecast_data(ROUTES, FORECAST)


@pytest.fixture
def forecast_rows() -> Rows:
    return read_rows(FORECAST)


@pytest.fixture
def routes_rows() -> Rows:
    return read_rows(ROUTES)


@pytest.fixture
def make_forecast(tmp_path: Path) -> Callable[[Rows], Path]:
    def make(rows: Rows) -> Path:
        return write_rows(tmp_path / "broken_forecast.csv", rows)

    return make


@pytest.fixture
def make_routes(tmp_path: Path) -> Callable[[Rows], Path]:
    def make(rows: Rows) -> Path:
        return write_rows(tmp_path / "broken_routes.csv", rows)

    return make


# ---- AC17: the stub data loads ----


def test_stub_data_loads_155_flights_5_routes_and_date_range(stub_data: ForecastData) -> None:
    assert len(stub_data.flights) == 155
    assert len(stub_data.routes) == 5
    assert stub_data.date_min == date(2026, 6, 1)
    assert stub_data.date_max == date(2026, 7, 1)
    assert stub_data.source == FORECAST


def test_forecast_columns_are_30_in_exact_order() -> None:
    assert len(FORECAST_COLUMNS) == 30
    assert FORECAST_COLUMNS[:6] == (
        "route",
        "date",
        "seats",
        "0.1_base_demand",
        "0.1_price",
        "0.1_price_demand",
    )
    assert FORECAST_COLUMNS[-3:] == ("0.9_base_demand", "0.9_price", "0.9_price_demand")
    assert tuple(read_rows(FORECAST)[0]) == FORECAST_COLUMNS


def test_flight_forecast_holds_nine_quantile_values(stub_data: ForecastData) -> None:
    flight = stub_data.flights[("MOW-AER", date(2026, 6, 1))]
    assert flight.seats == 900
    assert flight.base_demand[0] == Decimal(656)
    assert flight.best_price[0] == Decimal(8928)
    assert flight.best_price_demand[0] == Decimal(667)
    assert len(flight.base_demand) == len(flight.best_price) == len(flight.best_price_demand) == 9
    assert flight.best_price[-1] == Decimal(9875)


def test_route_info_is_parsed_and_split(stub_data: ForecastData) -> None:
    route = stub_data.routes["MOW-AER"]
    assert route.origin == "Москва"
    assert route.destination == "Сочи"
    assert route.base_price == Decimal(9000)
    assert route.cost_per_passenger == Decimal(4200)
    assert route.price_sensitivity == Decimal("0.141")
    assert route.price_min == Decimal(5400)
    assert route.price_max == Decimal(18000)


def test_find_route_moscow_sochi_and_reverse(stub_data: ForecastData) -> None:
    found = stub_data.find_route("Москва", "Сочи")
    assert found is not None
    assert found.code == "MOW-AER"
    assert stub_data.find_route("Сочи", "Москва") is None


def test_find_route_is_case_insensitive_and_strips_spaces(stub_data: ForecastData) -> None:
    found = stub_data.find_route("  москва ", " СОЧИ")
    assert found is not None
    assert found.code == "MOW-AER"


def test_origins_and_destinations(stub_data: ForecastData) -> None:
    assert stub_data.origins() == ["Москва"]
    destinations = stub_data.destinations("Москва")
    assert len(destinations) == 5
    assert "Сочи" in destinations
    assert stub_data.destinations("Сочи") == []


def test_fractional_forecast_loads() -> None:
    data = load_forecast_data(ROUTES, FLOAT_FORECAST)
    assert len(data.flights) == 3
    flight = data.flights[("MOW-AER", date(2026, 6, 1))]
    assert flight.base_demand[0] == Decimal("656.3")
    assert flight.best_price[0] == Decimal("8928.3")
    assert data.source == FLOAT_FORECAST


def test_seats_accept_integer_with_decimal_point(
    forecast_rows: Rows, make_forecast: Callable[[Rows], Path]
) -> None:
    forecast_rows[1][2] = "900.0"
    data = load_forecast_data(ROUTES, make_forecast(forecast_rows))
    assert data.flights[("MOW-AER", date(2026, 6, 1))].seats == 900


# ---- AC17: forecast schema errors ----


def test_missing_column_names_file(
    forecast_rows: Rows, make_forecast: Callable[[Rows], Path]
) -> None:
    rows = [r[:-1] for r in forecast_rows]
    path = make_forecast(rows)
    with pytest.raises(ForecastSchemaError, match=path.name):
        load_forecast_data(ROUTES, path)


def test_extra_column_names_file(
    forecast_rows: Rows, make_forecast: Callable[[Rows], Path]
) -> None:
    rows = [[*r, "x"] for r in forecast_rows]
    rows[0][-1] = "extra"
    path = make_forecast(rows)
    with pytest.raises(ForecastSchemaError, match=path.name):
        load_forecast_data(ROUTES, path)


def test_misordered_columns_names_file(
    forecast_rows: Rows, make_forecast: Callable[[Rows], Path]
) -> None:
    rows = [[r[1], r[0], *r[2:]] for r in forecast_rows]
    path = make_forecast(rows)
    with pytest.raises(ForecastSchemaError, match=path.name):
        load_forecast_data(ROUTES, path)


def test_duplicate_route_date_mentions_line(
    forecast_rows: Rows, make_forecast: Callable[[Rows], Path]
) -> None:
    forecast_rows.append(list(forecast_rows[1]))
    path = make_forecast(forecast_rows)
    with pytest.raises(ForecastSchemaError, match=rf"{path.name}: line {len(forecast_rows)}\b"):
        load_forecast_data(ROUTES, path)


def test_unknown_route_mentions_line(
    forecast_rows: Rows, make_forecast: Callable[[Rows], Path]
) -> None:
    forecast_rows[3][0] = "XXX-YYY"
    path = make_forecast(forecast_rows)
    with pytest.raises(ForecastSchemaError, match=rf"{path.name}: line 4\b"):
        load_forecast_data(ROUTES, path)


def test_non_numeric_value_mentions_line(
    forecast_rows: Rows, make_forecast: Callable[[Rows], Path]
) -> None:
    forecast_rows[5][7] = "abc"
    path = make_forecast(forecast_rows)
    with pytest.raises(ForecastSchemaError, match=rf"{path.name}: line 6\b"):
        load_forecast_data(ROUTES, path)


def test_negative_demand_mentions_line(
    forecast_rows: Rows, make_forecast: Callable[[Rows], Path]
) -> None:
    forecast_rows[2][3] = "-5"
    path = make_forecast(forecast_rows)
    with pytest.raises(ForecastSchemaError, match=rf"{path.name}: line 3\b"):
        load_forecast_data(ROUTES, path)


@pytest.mark.parametrize("seats", ["0", "-10"])
def test_non_positive_seats_mention_line(
    seats: str, forecast_rows: Rows, make_forecast: Callable[[Rows], Path]
) -> None:
    forecast_rows[4][2] = seats
    path = make_forecast(forecast_rows)
    with pytest.raises(ForecastSchemaError, match=rf"{path.name}: line 5\b"):
        load_forecast_data(ROUTES, path)


def test_zero_median_price_mentions_line(
    forecast_rows: Rows, make_forecast: Callable[[Rows], Path]
) -> None:
    column = FORECAST_COLUMNS.index("0.5_price")
    forecast_rows[6][column] = "0"
    path = make_forecast(forecast_rows)
    with pytest.raises(ForecastSchemaError, match=rf"{path.name}: line 7\b"):
        load_forecast_data(ROUTES, path)


def test_missing_forecast_file_raises_schema_error(tmp_path: Path) -> None:
    with pytest.raises(ForecastSchemaError, match=r"nope\.csv"):
        load_forecast_data(ROUTES, tmp_path / "nope.csv")


# ---- AC17: routes.csv errors ----


def test_routes_file_missing(tmp_path: Path) -> None:
    with pytest.raises(ForecastSchemaError, match=r"routes\.csv"):
        load_forecast_data(tmp_path / "routes.csv", FORECAST)


def test_routes_missing_column(routes_rows: Rows, make_routes: Callable[[Rows], Path]) -> None:
    rows = [r[:-1] for r in routes_rows]
    path = make_routes(rows)
    with pytest.raises(ForecastSchemaError, match=path.name):
        load_forecast_data(path, FORECAST)


def test_routes_extra_column(routes_rows: Rows, make_routes: Callable[[Rows], Path]) -> None:
    rows = [[*r, "x"] for r in routes_rows]
    path = make_routes(rows)
    with pytest.raises(ForecastSchemaError, match=path.name):
        load_forecast_data(path, FORECAST)


def test_routes_name_without_separator(
    routes_rows: Rows, make_routes: Callable[[Rows], Path]
) -> None:
    routes_rows[2][1] = "Москва-Сочи"
    path = make_routes(routes_rows)
    with pytest.raises(ForecastSchemaError, match=rf"{path.name}: line 3\b"):
        load_forecast_data(path, FORECAST)


def test_routes_non_numeric_sensitivity(
    routes_rows: Rows, make_routes: Callable[[Rows], Path]
) -> None:
    routes_rows[1][4] = "high"
    path = make_routes(routes_rows)
    with pytest.raises(ForecastSchemaError, match=rf"{path.name}: line 2\b"):
        load_forecast_data(path, FORECAST)


def test_routes_zero_sensitivity(routes_rows: Rows, make_routes: Callable[[Rows], Path]) -> None:
    routes_rows[3][4] = "0"
    path = make_routes(routes_rows)
    with pytest.raises(ForecastSchemaError, match=rf"{path.name}: line 4\b"):
        load_forecast_data(path, FORECAST)


def test_routes_non_positive_base_price(
    routes_rows: Rows, make_routes: Callable[[Rows], Path]
) -> None:
    routes_rows[1][2] = "0"
    path = make_routes(routes_rows)
    with pytest.raises(ForecastSchemaError, match=rf"{path.name}: line 2\b"):
        load_forecast_data(path, FORECAST)


def test_routes_price_min_above_price_max(
    routes_rows: Rows, make_routes: Callable[[Rows], Path]
) -> None:
    routes_rows[1][5], routes_rows[1][6] = "20000", "5000"
    path = make_routes(routes_rows)
    with pytest.raises(ForecastSchemaError, match=rf"{path.name}: line 2\b"):
        load_forecast_data(path, FORECAST)


# ---- AC17: settings and startup ----


def test_settings_honours_forecast_path_env(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    target = tmp_path / "my_forecast.csv"
    monkeypatch.setenv("REHIS_FORECAST_PATH", str(target))
    assert Settings().forecast_path == target


def test_settings_defaults() -> None:
    s = Settings()
    assert s.forecast_path == REPO / "data" / "seasonal_forecast.csv"
    assert s.routes_path == REPO / "data" / "routes.csv"
    assert s.db_path == REPO / "var" / "rehis.sqlite3"
    assert s.static_dir is None
    assert s.cookie_secure is True
    assert s.session_ttl_hours == 168
    assert s.registration_open is True
    assert s.max_users == 1000
    assert s.trusted_proxies == ["127.0.0.1"]


def test_settings_list_fields_parse_comma_separated_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("REHIS_ALLOWED_HOSTS", "a.example,b.example")
    monkeypatch.setenv("REHIS_TRUSTED_PROXIES", "10.0.0.0/8, 127.0.0.1")
    s = Settings()
    assert s.allowed_hosts == ["a.example", "b.example"]
    assert s.trusted_proxies == ["10.0.0.0/8", "127.0.0.1"]


def test_create_app_raises_for_broken_forecast_from_env(
    monkeypatch: pytest.MonkeyPatch, forecast_rows: Rows, make_forecast: Callable[[Rows], Path]
) -> None:
    forecast_rows[1][2] = "0"
    path = make_forecast(forecast_rows)
    monkeypatch.setenv("REHIS_FORECAST_PATH", str(path))
    with pytest.raises(ForecastSchemaError, match=path.name):
        create_app(Settings())


def test_create_app_stores_settings_and_forecast(settings: Settings) -> None:
    app = create_app(settings)
    assert app.state.settings is settings
    assert isinstance(app.state.forecast, ForecastData)
    assert len(app.state.forecast.flights) == 155


# ---- AC18: health ----


def test_health_reports_forecast_rows(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "forecast_rows": 155}
