from collections.abc import Callable
from pathlib import Path

import fastapi_offline
from fastapi import FastAPI
from fastapi.openapi.docs import get_swagger_ui_html
from starlette.responses import FileResponse, HTMLResponse

ASSETS_PREFIX = "/docs-assets"
# The fastapi-offline package ships the Swagger UI dist files (and Redoc, which is not served).
ASSETS_DIR = Path(fastapi_offline.__file__).parent / "static"
# Only the files the docs page loads are served, not the whole directory.
_ASSETS: dict[str, str] = {
    "swagger-ui-bundle.js": "text/javascript; charset=utf-8",
    "swagger-ui.css": "text/css; charset=utf-8",
    "favicon.png": "image/png",
}


def _asset_route(path: Path, media_type: str) -> Callable[[], FileResponse]:
    def serve() -> FileResponse:
        return FileResponse(path, media_type=media_type)

    return serve


def install_docs(app: FastAPI) -> None:
    """Serve Swagger UI at /docs with its assets from this app instead of a CDN."""
    openapi_url = app.openapi_url or "/openapi.json"

    def docs() -> HTMLResponse:
        return get_swagger_ui_html(
            openapi_url=openapi_url,
            title=f"{app.title} — API",
            swagger_js_url=f"{ASSETS_PREFIX}/swagger-ui-bundle.js",
            swagger_css_url=f"{ASSETS_PREFIX}/swagger-ui.css",
            swagger_favicon_url=f"{ASSETS_PREFIX}/favicon.png",
            # No badge fetched from validator.swagger.io: the CSP allows no external origin.
            swagger_ui_parameters={"validatorUrl": None},
        )

    app.add_api_route("/docs", docs, methods=["GET"], include_in_schema=False)
    for name, media_type in _ASSETS.items():
        app.add_api_route(
            f"{ASSETS_PREFIX}/{name}",
            _asset_route(ASSETS_DIR / name, media_type),
            methods=["GET"],
            include_in_schema=False,
        )
