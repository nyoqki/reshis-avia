from fastapi import FastAPI

from rehis.api import health


def create_app() -> FastAPI:
    app = FastAPI(title="Reshis Avia", redoc_url=None)
    app.include_router(health.router, prefix="/api")
    return app
