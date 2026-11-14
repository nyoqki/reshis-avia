import csv
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path

QUANTILES: tuple[Decimal, ...] = tuple(Decimal(i) / 10 for i in range(1, 10))

FORECAST_COLUMNS: tuple[str, ...] = (
    "route",
    "date",
    "seats",
    *(f"{q}_{suffix}" for q in QUANTILES for suffix in ("base_demand", "price", "price_demand")),
)

ROUTES_COLUMNS: tuple[str, ...] = (
    "route",
    "name",
    "base_price",
    "cost_per_passenger",
    "price_sensitivity",
    "price_min",
    "price_max",
)

NAME_SEPARATOR = " — "
MEDIAN_INDEX = 4


class ForecastSchemaError(ValueError):
    """The routes or forecast CSV does not match the expected schema."""


@dataclass(frozen=True)
class RouteInfo:
    code: str
    origin: str
    destination: str
    base_price: Decimal
    cost_per_passenger: Decimal
    price_sensitivity: Decimal
    price_min: Decimal
    price_max: Decimal


@dataclass(frozen=True)
class FlightForecast:
    route: str
    flight_date: date
    seats: int
    base_demand: tuple[Decimal, ...]
    best_price: tuple[Decimal, ...]
    best_price_demand: tuple[Decimal, ...]


def _norm(value: str) -> str:
    return value.strip().casefold()


@dataclass(frozen=True)
class ForecastData:
    routes: Mapping[str, RouteInfo]
    flights: Mapping[tuple[str, date], FlightForecast]
    date_min: date
    date_max: date
    source: Path

    def find_route(self, origin: str, destination: str) -> RouteInfo | None:
        o, d = _norm(origin), _norm(destination)
        for route in self.routes.values():
            if _norm(route.origin) == o and _norm(route.destination) == d:
                return route
        return None

    def origins(self) -> list[str]:
        return sorted({r.origin for r in self.routes.values()})

    def destinations(self, origin: str) -> list[str]:
        o = _norm(origin)
        return sorted({r.destination for r in self.routes.values() if _norm(r.origin) == o})


def _fail(path: Path, line: int | None, problem: str) -> ForecastSchemaError:
    where = path.name if line is None else f"{path.name}: line {line}"
    return ForecastSchemaError(f"{where}: {problem}")


def _decimal(path: Path, line: int, column: str, raw: str) -> Decimal:
    try:
        value = Decimal(raw.strip())
    except InvalidOperation:
        raise _fail(path, line, f"column {column!r} is not a number: {raw!r}") from None
    if not value.is_finite():
        raise _fail(path, line, f"column {column!r} is not a finite number: {raw!r}")
    return value


def _read_table(path: Path, columns: tuple[str, ...]) -> list[tuple[int, list[str]]]:
    try:
        handle = path.open(newline="", encoding="utf-8-sig")
    except OSError as exc:
        raise _fail(path, None, f"cannot read file ({exc.strerror or exc})") from exc
    with handle:
        try:
            reader = csv.reader(handle)
            header = next(reader, None)
            if header is None:
                raise _fail(path, None, "file is empty")
            header = [h.strip() for h in header]
            if header != list(columns):
                missing = [c for c in columns if c not in header]
                extra = [h for h in header if h not in columns]
                detail = f"missing {missing}" if missing else ""
                if extra:
                    detail += f"{'; ' if detail else ''}unexpected {extra}"
                if not detail:
                    detail = "columns are in the wrong order"
                raise _fail(
                    path,
                    1,
                    f"header does not match the expected {len(columns)} columns: {detail}",
                )
            rows: list[tuple[int, list[str]]] = []
            for row in reader:
                if not row:
                    continue
                if len(row) != len(columns):
                    raise _fail(
                        path, reader.line_num, f"expected {len(columns)} values, got {len(row)}"
                    )
                rows.append((reader.line_num, row))
            return rows
        except (csv.Error, UnicodeDecodeError) as exc:
            raise _fail(path, None, f"cannot parse CSV ({exc})") from exc


def _load_routes(path: Path) -> dict[str, RouteInfo]:
    routes: dict[str, RouteInfo] = {}
    for line, row in _read_table(path, ROUTES_COLUMNS):
        code = row[0].strip()
        if not code:
            raise _fail(path, line, "route code is empty")
        if code in routes:
            raise _fail(path, line, f"duplicate route {code!r}")
        origin, sep, destination = row[1].partition(NAME_SEPARATOR)
        origin, destination = origin.strip(), destination.strip()
        if not sep or not origin or not destination:
            raise _fail(path, line, f"name must look like 'Origin{NAME_SEPARATOR}Destination'")
        base_price, cost, sensitivity, price_min, price_max = (
            _decimal(path, line, col, raw)
            for col, raw in zip(ROUTES_COLUMNS[2:], row[2:], strict=True)
        )
        if base_price <= 0:
            raise _fail(path, line, "base_price must be positive")
        if sensitivity <= 0:
            raise _fail(path, line, "price_sensitivity must be positive")
        if price_min > price_max:
            raise _fail(path, line, "price_min must not exceed price_max")
        routes[code] = RouteInfo(
            code, origin, destination, base_price, cost, sensitivity, price_min, price_max
        )
    if not routes:
        raise _fail(path, None, "no routes")
    return routes


def _load_flights(
    path: Path, routes: Mapping[str, RouteInfo]
) -> dict[tuple[str, date], FlightForecast]:
    flights: dict[tuple[str, date], FlightForecast] = {}
    for line, row in _read_table(path, FORECAST_COLUMNS):
        code = row[0].strip()
        if code not in routes:
            raise _fail(path, line, f"route {code!r} is not in the routes file")
        try:
            flight_date = date.fromisoformat(row[1].strip())
        except ValueError:
            raise _fail(path, line, f"date is not YYYY-MM-DD: {row[1]!r}") from None
        seats_value = _decimal(path, line, "seats", row[2])
        if seats_value != seats_value.to_integral_value() or seats_value <= 0:
            raise _fail(path, line, f"seats must be a positive integer: {row[2]!r}")
        key = (code, flight_date)
        if key in flights:
            raise _fail(path, line, f"duplicate (route, date): {code}, {flight_date}")
        values: list[Decimal] = []
        for column, raw in zip(FORECAST_COLUMNS[3:], row[3:], strict=True):
            value = _decimal(path, line, column, raw)
            if column.endswith("_price"):
                if value <= 0:
                    raise _fail(path, line, f"{column} must be positive")
            elif value < 0:
                raise _fail(path, line, f"{column} must not be negative")
            values.append(value)
        flights[key] = FlightForecast(
            route=code,
            flight_date=flight_date,
            seats=int(seats_value),
            base_demand=tuple(values[0::3]),
            best_price=tuple(values[1::3]),
            best_price_demand=tuple(values[2::3]),
        )
    if not flights:
        raise _fail(path, None, "no forecast rows")
    return flights


def load_forecast_data(routes_path: Path, forecast_path: Path) -> ForecastData:
    routes = _load_routes(routes_path)
    flights = _load_flights(forecast_path, routes)
    dates = [d for _, d in flights]
    return ForecastData(
        routes=routes,
        flights=flights,
        date_min=min(dates),
        date_max=max(dates),
        source=forecast_path,
    )
