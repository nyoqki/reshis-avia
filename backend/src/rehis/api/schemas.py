"""Request and response bodies of the forecast API."""

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

CityName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]


class ForecastRequest(BaseModel, extra="forbid"):
    origin: CityName
    destination: CityName
    date: date
    price: Annotated[int, Field(ge=1, le=1_000_000)]


class RouteOut(BaseModel):
    code: str
    origin: str
    destination: str
    base_price: int
    price_min: int
    price_max: int


class RoutesResponse(BaseModel):
    origin: str
    date_min: date
    date_max: date
    routes: list[RouteOut]


class ScenarioOut(BaseModel):
    quantile: float
    wants: int
    wants_raw: float
    buys: int
    hits_seats: bool


class SelloutOut(BaseModel):
    low_pct: int | None
    high_pct: int | None


class RecommendationOut(BaseModel):
    price: int
    corridor_low: int
    corridor_high: int
    corridor_pct: int
    risky: bool


class ForecastResponse(BaseModel):
    route: str
    origin: str
    destination: str
    date: date
    price: int
    seats: int
    wants: int
    wants_raw: float
    buys: int
    free_seats: int
    limit: Literal["none", "no_demand", "seats"]
    base_price: int
    price_min: int
    price_max: int
    price_in_range: bool
    scenarios: list[ScenarioOut]
    sellout: SelloutOut
    recommendation: RecommendationOut
    history_id: int


class HistoryItem(BaseModel):
    id: int
    route: str
    origin: str
    destination: str
    date: date
    price: int
    seats: int
    wants: int
    buys: int
    created_at: datetime


class HistoryResponse(BaseModel):
    items: list[HistoryItem]
