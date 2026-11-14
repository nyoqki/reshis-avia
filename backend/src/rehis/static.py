from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.responses import Response
from starlette.types import Scope

IMMUTABLE_CACHE = "public, max-age=31536000, immutable"
NO_CACHE = "no-cache"
RESERVED_PREFIXES = ("api", "docs", "docs-assets", "openapi.json", "redoc")


class ImmutableStaticFiles(StaticFiles):
    """Hashed build assets: cacheable forever."""

    async def get_response(self, path: str, scope: Scope) -> Response:
        response = await super().get_response(path, scope)
        if response.status_code == 200:
            response.headers["Cache-Control"] = IMMUTABLE_CACHE
        return response


def _is_reserved(path: str) -> bool:
    first = path.split("/", 1)[0]
    return first in RESERVED_PREFIXES


def mount_frontend(app: FastAPI, static_dir: Path) -> None:
    root = static_dir.resolve()
    index = root / "index.html"
    assets = root / "assets"
    if assets.is_dir():
        app.mount("/assets", ImmutableStaticFiles(directory=assets), name="frontend-assets")

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str) -> FileResponse:
        if _is_reserved(path):
            raise HTTPException(status_code=404)
        candidate = (root / path).resolve()
        if path and candidate.is_relative_to(root) and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(index, headers={"Cache-Control": NO_CACHE})
