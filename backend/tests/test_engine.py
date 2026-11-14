from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest
from rehis.domain.engine import (
    RISKY_CORRIDOR_PCT,
    ForecastResult,
    SelloutBand,
    compute_forecast,
    demand_at_price,
    round_people,
    sellout_band,
)

from rehis.domain.data import (
    QUANTILES,
    FlightForecast,
    ForecastData,
    RouteInfo,
    load_forecast_data,
)

REPO = Path(__file__).resolve().parents[2]
ROUTES = REPO / "data" / "routes.csv"
FORECAST = REPO / "data" / "seasonal_forecast.csv"


@pytest.fixture(scope="module")
def stub() -> ForecastData:
    return load_forecast_data(ROUTES, FORECAST)


def run(stub: ForecastData, route: str, day: str, price: int) -> ForecastResult:
    return compute_forecast(
        stub.routes[route], stub.flights[(route, date.fromisoformat(day))], price
    )


def make_route() -> RouteInfo:
    return RouteInfo(
        code="TST-ONE",
        origin="A",
        destination="B",
        base_price=Decimal(1000),
        cost_per_passenger=Decimal(500),
        price_sensitivity=Decimal("0.1"),
        price_min=Decimal(600),
        price_max=Decimal(2000),
    )


def make_flight(prices: tuple[str, str, str], seats: int = 500) -> FlightForecast:
    """A flight whose 0.1 / 0.5 / 0.9 best prices are given, others interpolated."""
    p1, p5, p9 = (Decimal(p) for p in prices)
    best = tuple(p1 if q < Decimal("0.5") else p9 if q > Decimal("0.5") else p5 for q in QUANTILES)
    base = tuple(Decimal(100 * (i + 1)) for i in range(9))
    return FlightForecast(
        route="TST-ONE",
        flight_date=date(2026, 6, 1),
        seats=seats,
        base_demand=base,
        best_price=best,
        best_price_demand=base,
    )


# --- round_people -----------------------------------------------------------


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("0.5", 1),
        ("1.5", 2),
        ("2.5", 3),
        ("-0.5", -1),
        ("-1.5", -2),
        ("970.4999", 970),
        ("970.5", 971),
    ],
)
def test_round_people_half_up_away_from_zero(value: str, expected: int) -> None:
    assert round_people(Decimal(value)) == expected


def test_demand_has_no_float_noise(stub: ForecastData) -> None:
    route = stub.routes["MOW-AER"]
    raw = demand_at_price(Decimal(970), route, 12000)
    assert raw == Decimal(547)
    assert isinstance(raw, Decimal)
    assert round_people(Decimal("0.141") * 3000) == 423


# --- AC9, AC10, AC11: control examples ---------------------------------------


def test_ac9_moscow_sochi_base_price(stub: ForecastData) -> None:
    r = run(stub, "MOW-AER", "2026-06-12", 9000)
    assert (r.seats, r.wants, r.buys, r.free_seats, r.limit) == (900, 970, 900, 0, "seats")
    assert r.price_in_range is True


def test_ac9_moscow_sochi_higher_price(stub: ForecastData) -> None:
    r = run(stub, "MOW-AER", "2026-06-12", 12000)
    assert (r.wants, r.buys, r.free_seats, r.limit) == (547, 547, 353, "none")


def test_ac10_negative_demand(stub: ForecastData) -> None:
    r = run(stub, "MOW-LED", "2026-06-01", 20000)
    assert r.wants_raw == Decimal(-3120)
    assert r.buys == 0
    assert r.free_seats == 1440
    assert r.limit == "no_demand"
    assert r.price_in_range is False


def test_ac11_all_scenarios_hit_seats(stub: ForecastData) -> None:
    r = run(stub, "MOW-OVB", "2026-06-20", 8000)
    assert r.buys == 270
    assert all(s.hits_seats for s in r.scenarios)
    assert (r.sellout.low_pct, r.sellout.high_pct) == (90, None)


# --- AC12: scenarios ----------------------------------------------------------


def test_ac12_nine_scenarios_median_matches_headline(stub: ForecastData) -> None:
    checked = 0
    for (route_code, _), flight in stub.flights.items():
        route = stub.routes[route_code]
        prices = {
            int(route.price_min),
            int(route.base_price),
            int(route.price_max),
            int(route.base_price) + 1,
        }
        for price in prices:
            r = compute_forecast(route, flight, price)
            assert len(r.scenarios) == 9
            assert r.scenarios[4].wants == r.wants
            assert [s.quantile for s in r.scenarios] == list(QUANTILES)
            checked += 1
    assert checked >= 155 * 3


def test_scenario_fields_follow_definition(stub: ForecastData) -> None:
    r = run(stub, "MOW-AER", "2026-06-12", 12000)
    for s in r.scenarios:
        assert s.wants == round_people(s.wants_raw)
        assert s.buys == min(r.seats, max(0, s.wants))
        assert s.hits_seats == (s.wants >= r.seats)
    assert r.scenarios[0].wants_raw == Decimal(822) - Decimal("0.141") * 3000


# --- AC13: sell-out band ------------------------------------------------------


def test_ac13_band_for_flight(stub: ForecastData) -> None:
    low = run(stub, "MOW-AER", "2026-06-12", 9000).sellout
    assert (low.low_pct, low.high_pct) == (70, 80)
    high = run(stub, "MOW-AER", "2026-06-12", 12000).sellout
    assert (high.low_pct, high.high_pct) == (None, 10)


LADDER = [100 * i for i in range(1, 10)]


@pytest.mark.parametrize(
    ("seats", "expected"),
    [
        (350, (60, 70)),
        (900, (10, 20)),
        (901, (None, 10)),
        (100, (90, None)),
        (101, (80, 90)),
    ],
)
def test_ac13_band_boundaries(seats: int, expected: tuple[int | None, int | None]) -> None:
    assert sellout_band(LADDER, seats) == SelloutBand(*expected)


def test_ac13_plateau_has_no_division_by_zero() -> None:
    plateau = [100, 200, 300, 300, 300, 300, 300, 300, 300]
    assert sellout_band(plateau, 300) == SelloutBand(70, 80)
    assert sellout_band(plateau, 301) == SelloutBand(None, 10)


def test_ac13_unsorted_input_is_sorted() -> None:
    shuffled = [500, 100, 900, 300, 700, 200, 800, 400, 600]
    assert sellout_band(shuffled, 350) == sellout_band(LADDER, 350)


# --- AC14: recommendation -----------------------------------------------------


def test_ac14_recommendation_uses_best_prices(stub: ForecastData) -> None:
    flight = stub.flights[("MOW-AER", date(2026, 6, 12))]
    rec = compute_forecast(stub.routes["MOW-AER"], flight, 9000).recommendation
    assert rec.price == round_people(flight.best_price[4])
    assert rec.corridor_low == round_people(flight.best_price[0])
    assert rec.corridor_high == round_people(flight.best_price[8])
    ratio = (flight.best_price[8] - flight.best_price[0]) / flight.best_price[4]
    assert rec.corridor_ratio == ratio
    assert rec.corridor_pct == round_people(ratio * 100)
    assert rec.risky == (rec.corridor_pct >= RISKY_CORRIDOR_PCT)


def test_ac14_risky_threshold_follows_displayed_integer() -> None:
    assert RISKY_CORRIDOR_PCT == 15
    route = make_route()
    risky = compute_forecast(route, make_flight(("1000", "1000", "1149.6")), 1000)
    assert risky.recommendation.corridor_pct == 15
    assert risky.recommendation.risky is True
    calm = compute_forecast(route, make_flight(("1000", "1000", "1144.9")), 1000)
    assert calm.recommendation.corridor_pct == 14
    assert calm.recommendation.risky is False


@pytest.mark.parametrize("median", ["0", "-5"])
def test_ac14_non_positive_median_price_is_defensive(median: str) -> None:
    r = compute_forecast(make_route(), make_flight(("900", median, "1100")), 1000)
    assert r.recommendation.corridor_ratio == 0
    assert r.recommendation.corridor_pct == 0
    assert r.recommendation.risky is False
