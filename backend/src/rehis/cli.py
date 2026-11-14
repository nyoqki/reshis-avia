"""Terminal check of the forecast formula, backed by the same engine as the API."""

import argparse
import sys
from collections.abc import Sequence
from datetime import date

from rehis.config import get_settings
from rehis.domain.data import ForecastSchemaError, load_forecast_data
from rehis.domain.engine import compute_forecast
from rehis.domain.trip import TripError, resolve_trip

MAX_PRICE = 1_000_000


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="rehis-forecast", description="Прогноз спроса на рейс по формуле сервиса"
    )
    parser.add_argument("--from", dest="origin", default="Москва", help="город вылета")
    parser.add_argument("--to", dest="destination", required=True, help="город прилёта")
    parser.add_argument("--date", required=True, help="дата вылета, YYYY-MM-DD")
    parser.add_argument("--price", type=int, required=True, help="цена билета, целое число")
    return parser


def _fail(message: str) -> int:
    print(message, file=sys.stderr)
    return 2


def main(argv: Sequence[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    try:
        flight_date = date.fromisoformat(args.date)
    except ValueError:
        return _fail("Дата должна быть в формате YYYY-MM-DD")
    if not 1 <= args.price <= MAX_PRICE:
        return _fail(f"Цена должна быть целым числом от 1 до {MAX_PRICE}")

    settings = get_settings()
    try:
        data = load_forecast_data(settings.routes_path, settings.forecast_path)
    except ForecastSchemaError as exc:
        print(f"Данные прогноза недоступны: {exc}", file=sys.stderr)
        return 1
    try:
        route, flight = resolve_trip(data, args.origin, args.destination, flight_date)
    except TripError as exc:
        return _fail(exc.message)

    result = compute_forecast(route, flight, args.price)
    print(f"Мест: {result.seats}")
    print(f"Желают: {result.wants}")
    print(f"Купят: {result.buys}")
    print(f"Свободно: {result.free_seats}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
