"""Route and date validation shared by the API and the CLI."""

from datetime import date
from typing import Literal

from rehis.domain.data import FlightForecast, ForecastData, RouteInfo

ONLY_FROM_ORIGIN_MESSAGE = "Рейсы есть только из Москвы"
NO_FORECAST_MESSAGE = "Для этой даты нет прогноза по маршруту"

_MONTHS = (
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
)


class TripError(ValueError):
    """The requested trip cannot be forecast; carries the offending form field."""

    def __init__(self, field: Literal["origin", "destination", "date"], message: str) -> None:
        super().__init__(message)
        self.field = field
        self.message = message


def _day_month(value: date) -> str:
    return f"{value.day} {_MONTHS[value.month - 1]}"


def _date_range_message(date_min: date, date_max: date) -> str:
    # "\u0441" is a Cyrillic letter that looks like a Latin one (ruff RUF001).
    start, end = _day_month(date_min), _day_month(date_max)
    if date_min.year == date_max.year:
        return f"Прогноз есть на даты \u0441 {start} по {end} {date_max.year} года"
    return f"Прогноз есть на даты \u0441 {start} {date_min.year} года по {end} {date_max.year} года"


def resolve_trip(
    data: ForecastData, origin: str, destination: str, flight_date: date
) -> tuple[RouteInfo, FlightForecast]:
    origins = {r.origin.strip().casefold() for r in data.routes.values()}
    if origin.strip().casefold() not in origins:
        raise TripError("origin", ONLY_FROM_ORIGIN_MESSAGE)
    route = data.find_route(origin, destination)
    if route is None:
        available = ", ".join(dict.fromkeys(r.destination for r in data.routes.values()))
        raise TripError("destination", f"Нет рейсов в этот город. Доступны: {available}")
    if not data.date_min <= flight_date <= data.date_max:
        raise TripError("date", _date_range_message(data.date_min, data.date_max))
    flight = data.flights.get((route.code, flight_date))
    if flight is None:
        raise TripError("date", NO_FORECAST_MESSAGE)
    return route, flight
