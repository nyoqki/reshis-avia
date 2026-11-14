import logging

from fastapi import FastAPI

from rehis.api import health
from rehis.config import Settings, get_settings
from rehis.domain.data import load_forecast_data

logger = logging.getLogger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    forecast = load_forecast_data(settings.routes_path, settings.forecast_path)
    logger.info("Loaded forecast from %s: %d rows", forecast.source, len(forecast.flights))
    app = FastAPI(title="Reshis Avia", redoc_url=None)
    app.state.settings = settings
    app.state.forecast = forecast
    app.include_router(health.router, prefix="/api")
    return app
