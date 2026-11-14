import math
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from fractions import Fraction
from typing import Final, Literal

from rehis.domain.data import MEDIAN_INDEX, QUANTILES, FlightForecast, RouteInfo

RISKY_CORRIDOR_PCT: Final = 15

Limit = Literal["none", "no_demand", "seats"]


def round_people(value: Decimal) -> int:
    """Round half away from zero to a whole number."""
    return int(value.quantize(Decimal(1), rounding=ROUND_HALF_UP))


def demand_at_price(base_demand: Decimal, route: RouteInfo, price: int) -> Decimal:
    return base_demand - route.price_sensitivity * (Decimal(price) - route.base_price)


@dataclass(frozen=True)
class Scenario:
    quantile: Decimal
    wants_raw: Decimal
    wants: int
    buys: int
    hits_seats: bool


@dataclass(frozen=True)
class SelloutBand:
    low_pct: int | None
    high_pct: int | None


@dataclass(frozen=True)
class Recommendation:
    price: int
    corridor_low: int
    corridor_high: int
    corridor_ratio: Decimal
    corridor_pct: int
    risky: bool


@dataclass(frozen=True)
class ForecastResult:
    route: RouteInfo
    flight_date: date
    price: int
    seats: int
    wants_raw: Decimal
    wants: int
    buys: int
    free_seats: int
    limit: Limit
    price_in_range: bool
    scenarios: tuple[Scenario, ...]
    sellout: SelloutBand
    recommendation: Recommendation


def _scenario(quantile: Decimal, wants_raw: Decimal, seats: int) -> Scenario:
    wants = round_people(wants_raw)
    return Scenario(
        quantile=quantile,
        wants_raw=wants_raw,
        wants=wants,
        buys=min(seats, max(0, wants)),
        hits_seats=wants >= seats,
    )


def sellout_band(scenario_wants: Sequence[int], seats: int) -> SelloutBand:
    demand = sorted(scenario_wants)
    if demand[0] >= seats:
        return SelloutBand(90, None)
    if demand[-1] < seats:
        return SelloutBand(None, 10)
    i = next(k for k, d in enumerate(demand) if d >= seats)
    # demand[i - 1] < seats <= demand[i], so the denominator is positive.
    q_star = Fraction(i, 10) + Fraction(1, 10) * Fraction(seats - demand[i - 1]) / Fraction(
        demand[i] - demand[i - 1]
    )
    low = math.floor((1 - q_star) * 10) * 10
    return SelloutBand(low, low + 10)


def _recommendation(flight: FlightForecast) -> Recommendation:
    p_low, p_mid, p_high = (flight.best_price[i] for i in (0, MEDIAN_INDEX, 8))
    if p_mid > 0:
        ratio = (p_high - p_low) / p_mid
        pct = round_people(ratio * 100)
    else:
        ratio, pct = Decimal(0), 0
    return Recommendation(
        price=round_people(p_mid),
        corridor_low=round_people(p_low),
        corridor_high=round_people(p_high),
        corridor_ratio=ratio,
        corridor_pct=pct,
        risky=pct >= RISKY_CORRIDOR_PCT,
    )


def compute_forecast(route: RouteInfo, flight: FlightForecast, price: int) -> ForecastResult:
    seats = flight.seats
    scenarios = tuple(
        _scenario(q, demand_at_price(base, route, price), seats)
        for q, base in zip(QUANTILES, flight.base_demand, strict=True)
    )
    median = scenarios[MEDIAN_INDEX]
    if median.wants <= 0:
        limit: Limit = "no_demand"
    elif median.wants >= seats:
        limit = "seats"
    else:
        limit = "none"
    return ForecastResult(
        route=route,
        flight_date=flight.flight_date,
        price=price,
        seats=seats,
        wants_raw=median.wants_raw,
        wants=median.wants,
        buys=median.buys,
        free_seats=seats - median.buys,
        limit=limit,
        price_in_range=route.price_min <= price <= route.price_max,
        scenarios=scenarios,
        sellout=sellout_band([s.wants for s in scenarios], seats),
        recommendation=_recommendation(flight),
    )
