#!/usr/bin/env bash
# Container smoke test for the production image (AC20, with AC9/AC2 inside the container).
set -euo pipefail

# Requests go to a local container: keep a developer's HTTP(S)_PROXY from intercepting them.
export NO_PROXY="127.0.0.1,localhost${NO_PROXY:+,$NO_PROXY}"
export no_proxy="127.0.0.1,localhost${no_proxy:+,$no_proxy}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

HOST="forecast.example.test"
ORIGIN="http://${HOST}"
IMAGE="rehis-dev:smoke"
NAME="rehis-smoke-$$"
VOLUME="rehis-smoke-vol-$$"
TMP="$(mktemp -d)"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

cleanup() {
  local code=$?
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker volume rm -f "$VOLUME" >/dev/null 2>&1 || true
  rm -rf "$TMP"
  if [ "$code" -ne 0 ]; then
    echo "docker smoke failed (exit $code)" >&2
  fi
}
trap cleanup EXIT

step() { echo "==> $*"; }

# 1. compose file is valid (AC20)
step "compose.prod.yaml passes docker compose config"
printf 'REHIS_ALLOWED_HOSTS=%s\nREHIS_ALLOWED_ORIGINS=%s\nREHIS_DEMO_USERNAME=demo\nREHIS_DEMO_PASSWORD=dummy\n' \
  "$HOST" "$ORIGIN" >"$TMP/dummy.env"
[ -f compose.prod.yaml ] || fail "compose.prod.yaml is missing"
REHIS_ENV_FILE="$TMP/dummy.env" docker compose -f compose.prod.yaml config -q \
  || fail "docker compose config rejected compose.prod.yaml"

# 2. image builds
step "build image"
[ -f Dockerfile ] || fail "Dockerfile is missing"
docker build -t "$IMAGE" . || fail "image build failed"

# 3. run with compose-like hardening and a production-shaped host list
step "run container"
PORT="$(/usr/bin/python3 -I -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')"
DEMO_PASSWORD="smoke-$RANDOM-$RANDOM"
docker volume create "$VOLUME" >/dev/null

run_container() {
  docker run -d --name "$NAME" \
    --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges:true \
    -v "$VOLUME:/data" -p "127.0.0.1:${PORT}:8000" \
    -e REHIS_COOKIE_SECURE=false \
    -e REHIS_ALLOWED_HOSTS="$HOST" \
    -e REHIS_ALLOWED_ORIGINS="$ORIGIN" \
    -e REHIS_DEMO_USERNAME=demo \
    -e REHIS_DEMO_PASSWORD="$DEMO_PASSWORD" \
    "$IMAGE" >/dev/null
}

wait_healthy() {
  local status=""
  for _ in $(seq 1 60); do
    status="$(docker inspect -f '{{.State.Health.Status}}' "$NAME" 2>/dev/null || true)"
    [ "$status" = "healthy" ] && return 0
    sleep 2
  done
  docker logs "$NAME" >&2 || true
  fail "container did not become healthy (last status: ${status:-none})"
}

run_container || fail "container failed to start"
step "wait for healthy"
wait_healthy

# 4. non-root
step "container user is not root"
uid="$(docker exec "$NAME" id -u)"
[ "$uid" != "0" ] || fail "container runs as root"

# 5. HTTP checks with the production Host and Origin
step "GET / returns HTML"
BASE="http://127.0.0.1:${PORT}"
index="$(curl -fsS -H "Host: $HOST" "$BASE/")" || fail "GET / failed"
printf '%s' "$index" | grep -qi '<html' || fail "GET / did not return HTML"

step "demo login and control forecast"
JAR="$TMP/cookies.txt"
curl -fsS -c "$JAR" -H "Host: $HOST" -H "Origin: $ORIGIN" -X POST "$BASE/api/auth/demo" >/dev/null \
  || fail "demo login failed"
body='{"origin":"Москва","destination":"Сочи","date":"2026-06-12","price":9000}'
forecast="$(curl -fsS -b "$JAR" -H "Host: $HOST" -H "Origin: $ORIGIN" -H 'Content-Type: application/json' \
  -X POST --data "$body" "$BASE/api/forecast")" || fail "POST /api/forecast failed"
printf '%s' "$forecast" | grep -Eq '"wants": ?970([,}]|$)' || fail "forecast wants is not 970: $forecast"

# 6. persistence across restart
step "history survives a restart"
docker restart "$NAME" >/dev/null || fail "restart failed"
wait_healthy
curl -fsS -c "$JAR" -H "Host: $HOST" -H "Origin: $ORIGIN" -X POST "$BASE/api/auth/demo" >/dev/null \
  || fail "demo login after restart failed"
history="$(curl -fsS -b "$JAR" -H "Host: $HOST" "$BASE/api/history")" || fail "GET /api/history failed"
printf '%s' "$history" | grep -Eq '"wants": ?970([,}]|$)' || fail "history entry lost after restart: $history"

echo "docker smoke passed"
