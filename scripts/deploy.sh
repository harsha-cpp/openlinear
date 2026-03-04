#!/usr/bin/env bash
# deploy.sh — Production deploy script for OpenLinear (optimized)
# Called by CI via SSH at /opt/openlinear/deploy.sh
# Also works standalone: ./scripts/deploy.sh
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/openlinear}"
cd "$DEPLOY_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

step() { echo -e "${CYAN}==>${NC} $1"; }
ok()   { echo -e "${GREEN}  ✓${NC} $1"; }
fail() { echo -e "${RED}  ✗${NC} $1"; exit 1; }
skip() { echo -e "${YELLOW}  ⊘${NC} $1"; }

# Record start time for timing
START_TIME=$(date +%s)

TQ# ── Pull latest code ──────────────────────────────────────────────
step "Pulling latest code..."
# Discard build-generated file changes (e.g. next-env.d.ts) that block ff-only pull
git reset --hard HEAD
OLD_HEAD=$(git rev-parse HEAD)
git pull origin main --ff-only
NEW_HEAD=$(git rev-parse HEAD)
ok "Code updated"

# Determine what changed
API_CHANGED=false
FE_CHANGED=false
DB_CHANGED=false

if [ "$OLD_HEAD" != "$NEW_HEAD" ]; then
  CHANGED_FILES=$(git diff --name-only $OLD_HEAD $NEW_HEAD || true)
  
  if echo "$CHANGED_FILES" | grep -q "^apps/api/"; then
    API_CHANGED=true
  fi
  
  if echo "$CHANGED_FILES" | grep -q "^apps/desktop-ui/\|^packages/"; then
    FE_CHANGED=true
  fi
  
  if echo "$CHANGED_FILES" | grep -q "^packages/db/\|prisma"; then
    DB_CHANGED=true
  fi
else
  # If no git changes, assume both need rebuild (manual trigger)
  API_CHANGED=true
  FE_CHANGED=true
fi

# ── Setup pnpm cache ─────────────────────────────────────────────
step "Setting up pnpm cache..."
export PNPM_HOME="/opt/openlinear/.pnpm-store"
export PATH="$PNPM_HOME:$PATH"
mkdir -p "$PNPM_HOME"

# Temporarily override NODE_ENV so pnpm installs devDependencies (prisma, etc.)
_saved_node_env="${NODE_ENV:-}"
export NODE_ENV=development

# Only run install if package.json or lockfile changed
if [ "$OLD_HEAD" != "$NEW_HEAD" ] && echo "$CHANGED_FILES" | grep -qE "(package\.json|pnpm-lock\.yaml)"; then
  step "Installing dependencies (lockfile changed)..."
  pnpm install --frozen-lockfile
  ok "Dependencies installed"
else
  skip "Dependencies unchanged"
fi

export NODE_ENV="${_saved_node_env}"

# ── Database ─────────────────────────────────────────────────────
step "Starting database..."
docker start openlinear-db 2>/dev/null \
    || docker run --detach --name openlinear-db \
        -e POSTGRES_DB=openlinear \
        -e POSTGRES_USER=openlinear \
        -e POSTGRES_PASSWORD=openlinear \
        -p 5432:5432 \
        -v postgres_data:/var/lib/postgresql/data \
        --restart unless-stopped \
        postgres:16-alpine 2>/dev/null \
    || true
ok "PostgreSQL start requested"

step "Waiting for database..."
for i in $(seq 1 30); do
    if docker exec openlinear-db pg_isready -U openlinear -d openlinear &>/dev/null \
       || pg_isready -h localhost -p 5432 -U openlinear &>/dev/null 2>&1; then
        ok "Database ready"
        break
    fi
    if [ "$i" -eq 30 ]; then
        fail "Database failed to start after 30s"
    fi
    sleep 1
done

# Source root .env to get DATABASE_URL (Neon) and other production vars.
if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

export DATABASE_URL="${DATABASE_URL:-postgresql://openlinear:openlinear@localhost:5432/openlinear}"
echo "DATABASE_URL=${DATABASE_URL}" > packages/db/.env

# Only regenerate Prisma if DB schema changed
if [ "$DB_CHANGED" = true ] || [ "$OLD_HEAD" = "$NEW_HEAD" ]; then
  step "Generating Prisma client..."
  pnpm --filter @openlinear/db db:generate
  ok "Prisma client generated"
  
  step "Pushing database schema..."
  pnpm --filter @openlinear/db db:push
  ok "Schema synced"
else
  skip "Database schema unchanged"
fi

# ── Build applications ───────────────────────────────────────────
if [ "$API_CHANGED" = true ] || [ "$OLD_HEAD" = "$NEW_HEAD" ]; then
  step "Building API..."
  pnpm --filter @openlinear/api build
  ok "API built"
else
  skip "API unchanged, skipping build"
fi

if [ "$FE_CHANGED" = true ] || [ "$OLD_HEAD" = "$NEW_HEAD" ]; then
  step "Building FE (desktop-ui)..."
  pnpm --filter @openlinear/desktop-ui build
  ok "FE built"
else
  skip "FE unchanged, skipping build"
fi

# ── Restart services ─────────────────────────────────────────────
step "Restarting services..."

if command -v pm2 &>/dev/null; then
    # Delete old dashboard names if they exist
    pm2 delete openlinear-dashboard 2>/dev/null || true
    pm2 delete dashboard 2>/dev/null || true
    
    # Use reload for zero-downtime restart if process exists
    if pm2 describe openlinear-api &>/dev/null; then
      if [ "$API_CHANGED" = true ] || [ "$OLD_HEAD" = "$NEW_HEAD" ]; then
        pm2 reload openlinear-api
        ok "API reloaded (zero-downtime)"
      else
        skip "API unchanged, not restarted"
      fi
    else
      pm2 start apps/api/dist/index.js --name openlinear-api
      ok "API started"
    fi
    
    if pm2 describe openlinear-fe &>/dev/null; then
      if [ "$FE_CHANGED" = true ] || [ "$OLD_HEAD" = "$NEW_HEAD" ]; then
        pm2 reload openlinear-fe
        ok "FE reloaded (zero-downtime)"
      else
        skip "FE unchanged, not restarted"
      fi
    else
      pm2 start npm --name openlinear-fe -- run start --prefix apps/desktop-ui
      ok "FE started"
    fi
    
    pm2 save
elif systemctl is-active --quiet openlinear-api 2>/dev/null; then
    sudo systemctl restart openlinear-api
    ok "API service restarted (systemd)"
else
    fail "No process manager found. Install pm2: npm install -g pm2"
fi

# Calculate elapsed time
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))
MINUTES=$((ELAPSED / 60))
SECONDS=$((ELAPSED % 60))

echo ""
echo -e "${GREEN}Deploy complete in ${MINUTES}m ${SECONDS}s!${NC}"
