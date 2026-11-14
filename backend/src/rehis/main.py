import logging

from fastapi import FastAPI

from rehis.api import health
from rehis.config import Settings, get_settings
from rehis.docs import install_docs
from rehis.domain.data import load_forecast_data
from rehis.errors import install_error_handlers
from rehis.security.middleware import install_security
from rehis.security.ratelimit import default_limiters

logger = logging.getLogger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    forecast = load_forecast_data(settings.routes_path, settings.forecast_path)
    logger.info("Loaded forecast from %s: %d rows", forecast.source, len(forecast.flights))
    app = FastAPI(title="Reshis Avia", docs_url=None, redoc_url=None)
    app.state.settings = settings
    app.state.forecast = forecast
    app.state.limiters = default_limiters()
    install_error_handlers(app)
    install_security(app, settings)
    install_docs(app)
    app.include_router(health.router, prefix="/api")
    return app
