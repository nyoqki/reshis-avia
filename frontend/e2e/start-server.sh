#!/bin/sh
# Starts the backend serving the built frontend with a throwaway database and a demo user.
set -eu

cd "$(dirname "$0")/.."
FRONTEND_DIR=$(pwd)

DB_DIR=$(mktemp -d)
export REHIS_DB_PATH="$DB_DIR/e2e.sqlite3"
export REHIS_STATIC_DIR="$FRONTEND_DIR/dist"
export REHIS_COOKIE_SECURE=false
export REHIS_ALLOWED_HOSTS=127.0.0.1
export REHIS_ALLOWED_ORIGINS=http://127.0.0.1:8031
export REHIS_DEMO_USERNAME=demo
# Test-only value, not a secret.
export REHIS_DEMO_PASSWORD=e2e-demo-password

exec uv run --directory ../backend uvicorn --factory rehis.main:create_app --host 127.0.0.1 --port 8031
