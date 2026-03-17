#!/usr/bin/env bash
# build-app.sh — Build the full OpenLinear desktop app (AppImage/dmg/deb)
#
# Usage:
#   ./scripts/build-app.sh              # build for current platform
#   ./scripts/build-app.sh --skip-sidecar   # skip sidecar rebuild (faster if unchanged)
#   ./scripts/build-app.sh --target appimage   # explicit target
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BINARIES_DIR="$ROOT_DIR/apps/desktop/src-tauri/binaries"

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

step() { echo -e "\n${CYAN}==>${NC} $1"; }
ok()   { echo -e "${GREEN}  ✓${NC} $1"; }
warn() { echo -e "${YELLOW}  ⚠${NC} $1"; }
fail() { echo -e "${RED}  ✗${NC} $1"; exit 1; }

SKIP_SIDECAR=false
BUNDLE_TARGET=""

for arg in "$@"; do
  case "$arg" in
    --skip-sidecar) SKIP_SIDECAR=true ;;
    --target) shift; BUNDLE_TARGET="$1" ;;
    --target=*) BUNDLE_TARGET="${arg#--target=}" ;;
  esac
done

OS="$(uname -s)"
ARCH="$(uname -m)"

echo ""
echo -e "${GREEN}OpenLinear — Desktop Build${NC}"
echo -e "Platform: ${CYAN}$OS / $ARCH${NC}"
echo ""

cd "$ROOT_DIR"

# ── Step 1: Check binaries directory ─────────────────────────────
step "Checking binaries directory..."
mkdir -p "$BINARIES_DIR"
ok "opencode is detected via PATH at runtime (not bundled)"

# ── Step 2: Build sidecar native binary ──────────────────────────
if [ "$SKIP_SIDECAR" = true ]; then
  warn "Skipping sidecar build (--skip-sidecar)"
  case "$OS" in
    Linux)  SIDECAR_BIN="$BINARIES_DIR/openlinear-sidecar-x86_64-unknown-linux-gnu" ;;
    Darwin)
      if [ "$ARCH" = "arm64" ]; then
        SIDECAR_BIN="$BINARIES_DIR/openlinear-sidecar-aarch64-apple-darwin"
      else
        SIDECAR_BIN="$BINARIES_DIR/openlinear-sidecar-x86_64-apple-darwin"
      fi
      ;;
  esac
  if [ ! -f "$SIDECAR_BIN" ]; then
    fail "No sidecar binary at $SIDECAR_BIN. Run without --skip-sidecar first."
  fi
  ok "Using existing sidecar binary"
else
  step "Building sidecar binary..."
  bash "$SCRIPT_DIR/build-sidecar.sh"
  ok "Sidecar binary built"
fi

# ── Step 3: Install dependencies ─────────────────────────────────
step "Installing dependencies..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
ok "Dependencies ready"

# ── Step 4: Build Tauri app ───────────────────────────────────────
step "Building Tauri desktop app..."
export NO_STRIP=true
if [ -n "$BUNDLE_TARGET" ]; then
  pnpm --filter @openlinear/desktop tauri build --bundles "$BUNDLE_TARGET"
else
  if ! pnpm --filter @openlinear/desktop tauri build; then
    warn "Bundled build failed. Retrying without bundling so the desktop binary is still runnable."
    pnpm --filter @openlinear/desktop tauri build --no-bundle
  fi
fi
ok "Tauri build complete"

# ── Step 5: Report output ─────────────────────────────────────────
step "Build artifacts:"
BUNDLE_DIR="$ROOT_DIR/apps/desktop/src-tauri/target/release/bundle"
RAW_BINARY="$ROOT_DIR/apps/desktop/src-tauri/target/release/openlinear-desktop"

if [ -d "$BUNDLE_DIR" ]; then
  find "$BUNDLE_DIR" -type f \( -name "*.AppImage" -o -name "*.dmg" -o -name "*.deb" \) | while read -r f; do
    SIZE=$(du -sh "$f" | cut -f1)
    echo -e "  ${GREEN}✓${NC} $(basename "$f")  ${CYAN}($SIZE)${NC}"
    echo -e "    ${YELLOW}→${NC} $f"
  done
else
  warn "Bundle directory not found at $BUNDLE_DIR"
fi

if [ -f "$RAW_BINARY" ]; then
  SIZE=$(du -sh "$RAW_BINARY" | cut -f1)
  echo -e "  ${GREEN}✓${NC} $(basename "$RAW_BINARY")  ${CYAN}($SIZE)${NC}"
  echo -e "    ${YELLOW}→${NC} $RAW_BINARY"
fi

echo ""
echo -e "${GREEN}Build complete!${NC} Run with: ${CYAN}pnpm run:app${NC}"
