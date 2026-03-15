#!/usr/bin/env bash
# run-app.sh — Find and launch the built OpenLinear AppImage (Linux) or .app (macOS)
#
# Usage:
#   ./scripts/run-app.sh          # auto-detect latest build
#   ./scripts/run-app.sh --build  # build first, then run
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BUNDLE_DIR="$ROOT_DIR/apps/desktop/src-tauri/target/release/bundle"
RAW_BINARY="$ROOT_DIR/apps/desktop/src-tauri/target/release/openlinear-desktop"

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok()   { echo -e "${GREEN}  ✓${NC} $1"; }
warn() { echo -e "${YELLOW}  ⚠${NC} $1"; }
fail() { echo -e "${RED}  ✗${NC} $1"; exit 1; }

BUILD_FIRST=false
for arg in "$@"; do
  case "$arg" in
    --build|-b) BUILD_FIRST=true ;;
  esac
done

if [ "$BUILD_FIRST" = true ]; then
  echo -e "${CYAN}==> Building app first...${NC}"
  bash "$SCRIPT_DIR/build-app.sh"
fi

OS="$(uname -s)"

case "$OS" in
  Linux)
    APP=$(find "$BUNDLE_DIR/appimage" -name "*.AppImage" 2>/dev/null | sort -V | tail -1)
    if [ -n "$APP" ]; then
      chmod +x "$APP"
      ok "Launching: $(basename "$APP")"
      echo -e "  ${YELLOW}→${NC} $APP"
      echo ""
      exec "$APP"
    fi

    if [ -f "$RAW_BINARY" ]; then
      chmod +x "$RAW_BINARY"
      warn "No AppImage found. Falling back to the raw desktop binary."
      echo -e "  ${YELLOW}→${NC} $RAW_BINARY"
      echo ""
      exec "$RAW_BINARY"
    fi

    fail "No AppImage or raw desktop binary found — run: pnpm build:app"
    ;;
  Darwin)
    APP=$(find "$BUNDLE_DIR" -name "*.app" -maxdepth 3 2>/dev/null | sort -V | tail -1)
    if [ -z "$APP" ]; then
      APP=$(find "$BUNDLE_DIR/dmg" -name "*.dmg" 2>/dev/null | sort -V | tail -1)
      if [ -z "$APP" ]; then
        fail "No .app or .dmg found in $BUNDLE_DIR — run: pnpm build:app"
      fi
      ok "Opening DMG: $(basename "$APP")"
      open "$APP"
    else
      ok "Launching: $(basename "$APP")"
      echo -e "  ${YELLOW}→${NC} $APP"
      echo ""
      open "$APP"
    fi
    ;;
  *)
    fail "Unsupported OS: $OS"
    ;;
esac
