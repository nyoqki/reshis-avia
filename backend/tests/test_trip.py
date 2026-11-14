from dataclasses import replace
from datetime import date
from pathlib import Path

import pytest

from rehis.domain.data import ForecastData, load_forecast_data
from rehis.domain.trip import TripError, resolve_trip

REPO = Path(__file__).resolve().parents[2]
ROUTES = REPO / "data" / "routes.csv"
FORECAST = REPO / "data" / "seasonal_forecast.csv"

ONLY_FROM_MOSCOW = "Рейсы есть только из Москвы"
UNKNOWN_DESTINATION = (
    "Нет рейсов в этот город. Доступны: "
    "Сочи, Санкт-Петербург, Калининград, Новосибирск, Минеральные Воды"
)
NO_FORECAST = "Для этой даты нет прогноза по маршруту"


@pytest.fixture(scope="module")
def data() -> ForecastData:
    return load_forecast_data(ROUTES, FORECAST)


def test_resolve_trip_returns_route_and_flight(data: ForecastData) -> None:
    route, flight = resolve_trip(data, "Москва", "Сочи", date(2026, 6, 12))

    assert route.code == "MOW-AER"
    assert flight.route == "MOW-AER"
    assert flight.flight_date == date(2026, 6, 12)
    assert flight.seats == 900


def test_resolve_trip_ignores_case_and_surrounding_whitespace(data: ForecastData) -> None:
    route, flight = resolve_trip(data, " москва ", "сочи", date(2026, 6, 12))

    assert route.code == "MOW-AER"
    assert flight.flight_date == date(2026, 6, 12)


def test_resolve_trip_accepts_range_boundaries(data: ForecastData) -> None:
    assert resolve_trip(data, "Москва", "Сочи", date(2026, 6, 1))[1].flight_date == date(2026, 6, 1)
    assert resolve_trip(data, "Москва", "Сочи", date(2026, 7, 1))[1].flight_date == date(2026, 7, 1)


def test_reverse_direction_is_an_origin_error(data: ForecastData) -> None:
    with pytest.raises(TripError) as excinfo:
        resolve_trip(data, "Сочи", "Москва", date(2026, 6, 12))

    assert excinfo.value.field == "origin"
    assert excinfo.value.message == ONLY_FROM_MOSCOW


def test_unknown_origin_is_an_origin_error(data: ForecastData) -> None:
    with pytest.raises(TripError) as excinfo:
        resolve_trip(data, "Омск", "Сочи", date(2026, 6, 12))

    assert excinfo.value.field == "origin"


def test_unknown_destination_lists_available_cities(data: ForecastData) -> None:
    with pytest.raises(TripError) as excinfo:
        resolve_trip(data, "Москва", "Париж", date(2026, 6, 12))

    assert excinfo.value.field == "destination"
    assert excinfo.value.message == UNKNOWN_DESTINATION


@pytest.mark.parametrize("day", [date(2026, 5, 31), date(2026, 7, 2)])
def test_date_outside_data_range_is_a_date_error(data: ForecastData, day: date) -> None:
    with pytest.raises(TripError) as excinfo:
        resolve_trip(data, "Москва", "Сочи", day)

    assert excinfo.value.field == "date"
    assert "1 июня" in excinfo.value.message
    assert "1 июля" in excinfo.value.message
    assert "2026" in excinfo.value.message


def test_trip_error_is_a_value_error(data: ForecastData) -> None:
    with pytest.raises(ValueError):
        resolve_trip(data, "Сочи", "Москва", date(2026, 6, 12))


def test_missing_flight_row_is_a_date_error(data: ForecastData) -> None:
    missing = ("MOW-AER", date(2026, 6, 12))
    sparse = replace(
        data, flights={key: value for key, value in data.flights.items() if key != missing}
    )

    with pytest.raises(TripError) as excinfo:
        resolve_trip(sparse, "Москва", "Сочи", date(2026, 6, 12))

    assert excinfo.value.field == "date"
    assert excinfo.value.message == NO_FORECAST
