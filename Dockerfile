# syntax=docker/dockerfile:1

# Base images are pinned by tag and digest, so a rebuild gets the same bytes; bump both together.
FROM node:22.23.5-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee AS frontend
WORKDIR /build/frontend
ENV CI=true
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN PNPM_VERSION="$(node -p "require('./package.json').packageManager.split('@')[1]")" \
    && npm install -g "pnpm@${PNPM_VERSION}" \
    && pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm build

FROM python:3.12.16-slim@sha256:5e2bdb1b0d542d5039cffb8181c65930093949194a65c365dfb1b0fe13a4fa5b AS runtime
COPY --from=ghcr.io/astral-sh/uv:0.13.8@sha256:5cc1805e2426484abca4ad46ea783bab281fdb225fd82d8ce6d66a81254bac85 /uv /uvx /bin/
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PYTHONUNBUFFERED=1 \
    PATH="/app/backend/.venv/bin:$PATH"

WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY backend/src ./src
RUN uv sync --frozen --no-dev

COPY data /app/data
COPY --from=frontend /build/frontend/dist /app/static

RUN groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin app \
    && mkdir /data \
    && chown 10001:10001 /data

ENV REHIS_STATIC_DIR=/app/static \
    REHIS_ROUTES_PATH=/app/data/routes.csv \
    REHIS_FORECAST_PATH=/app/data/seasonal_forecast.csv \
    REHIS_DB_PATH=/data/rehis.sqlite3

# Numeric, so the runtime can check it is not root without reading /etc/passwd.
USER 10001:10001
EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=5 \
    CMD ["python", "-c", "import os, urllib.request; host = (os.environ.get('REHIS_ALLOWED_HOSTS') or '127.0.0.1').split(',')[0].strip() or '127.0.0.1'; urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:8000/api/health', headers={'Host': host}), timeout=4)"]

CMD ["uvicorn", "--factory", "rehis.main:create_app", "--host", "0.0.0.0", "--port", "8000", "--no-server-header", "--workers", "1"]
