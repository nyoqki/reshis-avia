"""Routes for the form, the forecast itself and the per-user history."""

import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, Request

from rehis.api.schemas import (
    ForecastRequest,
    ForecastResponse,
    HistoryItem,
    HistoryResponse,
    RecommendationOut,
    RouteOut,
    RoutesResponse,
    ScenarioOut,
    SelloutOut,
)
from rehis.auth.deps import current_user
from rehis.config import Settings
from rehis.db import NewCalculation, User, add_calculation, get_db, list_calculations
from rehis.domain.data import ForecastData
from rehis.domain.engine import compute_forecast, round_people
from rehis.domain.trip import TripError, resolve_trip
from rehis.errors import VALIDATION_DETAIL, ApiError
from rehis.security.net import client_ip, parse_networks
from rehis.security.ratelimit import Limiters

router = APIRouter()

Db = Annotated[sqlite3.Connection, Depends(get_db)]
CurrentUser = Annotated[User, Depends(current_user)]


def _data(request: Request) -> ForecastData:
    data: ForecastData = request.app.state.forecast
    return data


@router.get("/routes")
def routes(request: Request) -> RoutesResponse:
    data = _data(request)
    items = list(data.routes.values())
    return RoutesResponse(
        origin=items[0].origin,
        date_min=data.date_min,
        date_max=data.date_max,
        routes=[
            RouteOut(
                code=r.code,
                origin=r.origin,
                destination=r.destination,
                base_price=round_people(r.base_price),
                price_min=round_people(r.price_min),
                price_max=round_people(r.price_max),
            )
            for r in items
        ],
    )


@router.post("/forecast")
def forecast(
    body: ForecastRequest, request: Request, conn: Db, user: CurrentUser
) -> ForecastResponse:
    limiters: Limiters = request.app.state.limiters
    key = str(user.id)
    if user.is_demo:
        # Every demo visitor shares one account; give each client address its own budget.
        settings: Settings = request.app.state.settings
        key = f"{key}:{client_ip(request, parse_networks(settings.trusted_proxies))}"
    limiters.forecast_user.hit(key)
    try:
        route, flight = resolve_trip(_data(request), body.origin, body.destination, body.date)
    except TripError as exc:
        raise ApiError(422, VALIDATION_DETAIL, {exc.field: exc.message}) from None
    result = compute_forecast(route, flight, body.price)
    history_id = add_calculation(
        conn,
        user.id,
        NewCalculation(
            route=route.code,
            origin=route.origin,
            destination=route.destination,
            flight_date=result.flight_date,
            price=result.price,
            seats=result.seats,
            wants=max(0, result.wants),
            buys=result.buys,
        ),
    )
    rec = result.recommendation
    return ForecastResponse(
        route=route.code,
        origin=route.origin,
        destination=route.destination,
        date=result.flight_date,
        price=result.price,
        seats=result.seats,
        wants=max(0, result.wants),
        wants_raw=round(float(result.wants_raw), 2),
        buys=result.buys,
        free_seats=result.free_seats,
        limit=result.limit,
        base_price=round_people(route.base_price),
        price_min=round_people(route.price_min),
        price_max=round_people(route.price_max),
        price_in_range=result.price_in_range,
        scenarios=[
            ScenarioOut(
                quantile=float(s.quantile),
                wants=max(0, s.wants),
                wants_raw=round(float(s.wants_raw), 2),
                buys=s.buys,
                hits_seats=s.hits_seats,
            )
            for s in result.scenarios
        ],
        sellout=SelloutOut(low_pct=result.sellout.low_pct, high_pct=result.sellout.high_pct),
        recommendation=RecommendationOut(
            price=rec.price,
            corridor_low=rec.corridor_low,
            corridor_high=rec.corridor_high,
            corridor_pct=rec.corridor_pct,
            risky=rec.risky,
        ),
        history_id=history_id,
    )


@router.get("/history")
def history(conn: Db, user: CurrentUser) -> HistoryResponse:
    return HistoryResponse(
        items=[
            HistoryItem(
                id=c.id,
                route=c.route,
                origin=c.origin,
                destination=c.destination,
                date=c.flight_date,
                price=c.price,
                seats=c.seats,
                wants=c.wants,
                buys=c.buys,
                created_at=c.created_at,
            )
            for c in list_calculations(conn, user.id)
        ]
    )
