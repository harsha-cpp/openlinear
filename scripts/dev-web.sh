#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

LOCAL_DATABASE_URL="${OPENLINEAR_LOCAL_DATABASE_URL:-postgresql://openlinear:openlinear@localhost:5432/openlinear}"
USE_REMOTE_DB="${OPENLINEAR_DEV_USE_REMOTE_DB:-auto}"

dotenv_database_url() {
  if [ ! -f .env ]; then
    return 0
  fi

  node -e 'try { process.loadEnvFile(".env"); if (process.env.DATABASE_URL) process.stdout.write(process.env.DATABASE_URL); } catch (error) { console.error(error.message); process.exit(1); }'
}

wait_for_local_db() {
  for i in $(seq 1 30); do
    if docker exec openlinear-db pg_isready -U openlinear -d openlinear >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  echo "[dev:web] Database failed to become ready after 30s." >&2
  exit 1
}

database_url_scope() {
  node -e 'const value = process.argv[1] || ""; if (!value) { process.stdout.write("missing"); process.exit(0); } try { const parsed = new URL(value); const hostname = parsed.hostname || ""; const localHosts = new Set(["", "localhost", "127.0.0.1", "0.0.0.0", "host.docker.internal"]); process.stdout.write(localHosts.has(hostname) ? "local" : "remote"); } catch { process.stdout.write("unknown"); }' "${1:-}"
}

apply_dev_profile_defaults() {
  case "${OPENLINEAR_DEV_PROFILE:-}" in
    low|constrained)
      : "${CARGO_BUILD_JOBS:=1}"
      : "${OPENLINEAR_NEXT_CPUS:=1}"
      : "${NODE_OPTIONS:=--max-old-space-size=1536}"
      : "${OPENLINEAR_NEXT_DEV_ENGINE:=webpack}"
      export CARGO_BUILD_JOBS OPENLINEAR_NEXT_CPUS NODE_OPTIONS OPENLINEAR_NEXT_DEV_ENGINE
      ;;
  esac
}

ENV_FILE_DATABASE_URL="$(dotenv_database_url)"
RESOLVED_DATABASE_URL="${DATABASE_URL:-$ENV_FILE_DATABASE_URL}"
DATABASE_SCOPE="$(database_url_scope "$RESOLVED_DATABASE_URL")"

DB_MODE="local"
case "$USE_REMOTE_DB" in
  1|true)
    DB_MODE="remote"
    ;;
  0|false)
    DB_MODE="local"
    ;;
  auto|"")
    if [ "$DATABASE_SCOPE" = "remote" ]; then
      DB_MODE="remote"
    fi
    ;;
  *)
    echo "[dev:web] OPENLINEAR_DEV_USE_REMOTE_DB must be auto, 0, or 1." >&2
    exit 1
    ;;
esac

if [ "$DB_MODE" = "remote" ]; then
  if [ -z "$RESOLVED_DATABASE_URL" ]; then
    echo "[dev:web] Remote database mode is enabled but DATABASE_URL is missing." >&2
    exit 1
  fi

  export DATABASE_URL="$RESOLVED_DATABASE_URL"
  echo "[dev:web] Using remote database..."
else
  export DATABASE_URL="${RESOLVED_DATABASE_URL:-$LOCAL_DATABASE_URL}"

  if [ "$DATABASE_URL" = "$LOCAL_DATABASE_URL" ]; then
    if ! docker ps --format '{{.Names}}' | grep -q '^openlinear-db$'; then
      echo "[dev:web] Starting local database..."
      docker compose up -d
    fi

    echo "[dev:web] Waiting for local database..."
    wait_for_local_db
  else
    echo "[dev:web] Using caller-provided local database..."
  fi
fi

apply_dev_profile_defaults

if [ "$DB_MODE" = "local" ]; then
  echo "[dev:web] Syncing database schema..."
  pnpm db:push >/dev/null
else
  echo "[dev:web] Skipping schema sync for remote database..."
fi

echo "[dev:web] Seeding test tasks..."
pnpm db:seed

echo "[dev:web] Starting sidecar and lightweight Next.js dev server..."

DATABASE_URL="$DATABASE_URL" API_PORT=3001 pnpm --filter @openlinear/sidecar dev &
SIDECAR_PID=$!

sleep 2

DATABASE_URL="$DATABASE_URL" PORT=3000 pnpm --filter @openlinear/desktop-ui dev:webpack

kill $SIDECAR_PID 2>/dev/null
