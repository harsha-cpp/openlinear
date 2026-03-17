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

  echo "[dev] Database failed to become ready after 30s." >&2
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
      : "${OPENLINEAR_TAURI_DEV_ARGS:=--no-watch}"
      : "${OPENLINEAR_NEXT_DEV_ENGINE:=webpack}"
      export CARGO_BUILD_JOBS OPENLINEAR_NEXT_CPUS NODE_OPTIONS OPENLINEAR_TAURI_DEV_ARGS OPENLINEAR_NEXT_DEV_ENGINE
      ;;
  esac
}

native_sidecar_binary() {
  local os arch triple
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Linux)
      if [ "$arch" = "aarch64" ] || [ "$arch" = "arm64" ]; then
        triple="aarch64-unknown-linux-gnu"
      else
        triple="x86_64-unknown-linux-gnu"
      fi
      ;;
    Darwin)
      if [ "$arch" = "arm64" ]; then
        triple="aarch64-apple-darwin"
      else
        triple="x86_64-apple-darwin"
      fi
      ;;
    *)
      echo ""
      return 0
      ;;
  esac

  printf '%s\n' "apps/desktop/src-tauri/binaries/openlinear-sidecar-$triple"
}

ensure_native_sidecar() {
  if [ "${OPENLINEAR_SKIP_SIDECAR_REBUILD:-0}" = "1" ]; then
    return 0
  fi

  local binary
  binary="$(native_sidecar_binary)"

  if [ -z "$binary" ]; then
    return 0
  fi

  if [ ! -f "$binary" ] || find apps/sidecar/src apps/api/src scripts/build-sidecar.sh -type f -newer "$binary" | grep -q .; then
    echo "[dev] Rebuilding native sidecar..."
    ./scripts/build-sidecar.sh >/dev/null
  fi
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
    echo "[dev] OPENLINEAR_DEV_USE_REMOTE_DB must be auto, 0, or 1." >&2
    exit 1
    ;;
esac

if [ "$DB_MODE" = "remote" ]; then
  if [ -z "$RESOLVED_DATABASE_URL" ]; then
    echo "[dev] Remote database mode is enabled but DATABASE_URL is missing." >&2
    exit 1
  fi

  export DATABASE_URL="$RESOLVED_DATABASE_URL"
  echo "[dev] Using remote database..."
else
  export DATABASE_URL="${RESOLVED_DATABASE_URL:-$LOCAL_DATABASE_URL}"

  if [ "$DATABASE_URL" = "$LOCAL_DATABASE_URL" ]; then
    if ! docker ps --format '{{.Names}}' | grep -q '^openlinear-db$'; then
      echo "[dev] Starting local database..."
      docker compose up -d
    fi

    echo "[dev] Waiting for local database..."
    wait_for_local_db
  else
    echo "[dev] Using caller-provided local database..."
  fi
fi

apply_dev_profile_defaults

if [ "$DB_MODE" = "local" ]; then
  echo "[dev] Syncing database schema..."
  pnpm db:push >/dev/null
else
  echo "[dev] Skipping schema sync for remote database..."
fi

echo "[dev] Seeding test tasks..."
pnpm db:seed

SIDECAR_PID=""

# Try Tauri desktop if available, otherwise fall back to Next.js dev server
if command -v tauri &>/dev/null || pnpm --filter @openlinear/desktop tauri --version &>/dev/null 2>&1; then
  ensure_native_sidecar
  echo "[dev] Starting Tauri desktop (the app manages its own sidecar)..."
  TAURI_DEV_ARGS=()
  if [ -n "${OPENLINEAR_TAURI_DEV_ARGS:-}" ]; then
    # shellcheck disable=SC2206
    TAURI_DEV_ARGS=(${OPENLINEAR_TAURI_DEV_ARGS})
  fi
  DATABASE_URL="$DATABASE_URL" API_PORT=3001 PORT=3000 pnpm --filter @openlinear/desktop tauri dev "${TAURI_DEV_ARGS[@]}"
else
  echo "[dev] Tauri not available, starting sidecar and Next.js dev server..."
  DATABASE_URL="$DATABASE_URL" API_PORT=3001 pnpm --filter @openlinear/sidecar dev &
  SIDECAR_PID=$!

  sleep 2

  DATABASE_URL="$DATABASE_URL" PORT=3000 pnpm --filter @openlinear/desktop-ui dev
fi

if [ -n "$SIDECAR_PID" ]; then
  kill $SIDECAR_PID 2>/dev/null
fi
