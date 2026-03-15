#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
SIDECAR_DIR="$ROOT_DIR/apps/sidecar"
BINARIES_DIR="$ROOT_DIR/apps/desktop/src-tauri/binaries"

OS="$(uname -s)"
ARCH="$(uname -m)"

echo "==> Detected platform: $OS / $ARCH"

echo "==> Generating Prisma client..."
pnpm --filter @openlinear/db db:generate

echo "==> Building TypeScript..."
pnpm --filter @openlinear/sidecar build

echo "==> Bundling with esbuild (ESM -> CJS)..."
cd "$SIDECAR_DIR"
npx esbuild src/index.ts \
  --bundle \
  --platform=node \
  --target=node18 \
  --outfile=dist/sidecar-entry.cjs \
  --format=cjs \
  '--define:import.meta.dirname=""'

case "$OS" in
  Darwin)
    echo "==> Building macOS binary with pkg..."
    if [ "$ARCH" = "arm64" ]; then
      npx @yao-pkg/pkg dist/sidecar-entry.cjs --target node18-macos-arm64 --output dist/sidecar-macos-arm64
    else
      npx @yao-pkg/pkg dist/sidecar-entry.cjs --target node18-macos-x64 --output dist/sidecar-macos-x64
    fi
    ;;
  Linux)
    echo "==> Building Linux binary with pkg..."
    if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
      npx @yao-pkg/pkg dist/sidecar-entry.cjs --target node18-linux-arm64 --output dist/sidecar-linux-arm64
    elif [ "$ARCH" = "x86_64" ]; then
      npx @yao-pkg/pkg dist/sidecar-entry.cjs --target node18-linux-x64 --output dist/sidecar-linux-x64
    else
      echo "==> Unsupported Linux architecture: $ARCH"
      exit 1
    fi
    ;;
  *)
    echo "==> Unsupported OS: $OS"
    exit 1
    ;;
esac

cd "$ROOT_DIR"

echo "==> Creating binaries directory..."
mkdir -p "$BINARIES_DIR"

echo "==> Copying and renaming binaries with Tauri target triples..."

if [ -f "$SIDECAR_DIR/dist/sidecar-macos-x64" ]; then
  cp "$SIDECAR_DIR/dist/sidecar-macos-x64" "$BINARIES_DIR/openlinear-sidecar-x86_64-apple-darwin"
  echo "  - openlinear-sidecar-x86_64-apple-darwin"
fi

if [ -f "$SIDECAR_DIR/dist/sidecar-macos-arm64" ]; then
  cp "$SIDECAR_DIR/dist/sidecar-macos-arm64" "$BINARIES_DIR/openlinear-sidecar-aarch64-apple-darwin"
  echo "  - openlinear-sidecar-aarch64-apple-darwin"
fi

if [ -f "$SIDECAR_DIR/dist/sidecar-linux-x64" ]; then
  cp "$SIDECAR_DIR/dist/sidecar-linux-x64" "$BINARIES_DIR/openlinear-sidecar-x86_64-unknown-linux-gnu"
  echo "  - openlinear-sidecar-x86_64-unknown-linux-gnu"
fi

if [ -f "$SIDECAR_DIR/dist/sidecar-linux-arm64" ]; then
  cp "$SIDECAR_DIR/dist/sidecar-linux-arm64" "$BINARIES_DIR/openlinear-sidecar-aarch64-unknown-linux-gnu"
  echo "  - openlinear-sidecar-aarch64-unknown-linux-gnu"
fi

echo "==> Checking opencode binary..."
case "$OS" in
  Linux)  OPENCODE_BIN="$BINARIES_DIR/opencode-x86_64-unknown-linux-gnu" ;;
  Darwin)
    if [ "$ARCH" = "arm64" ]; then
      OPENCODE_BIN="$BINARIES_DIR/opencode-aarch64-apple-darwin"
    else
      OPENCODE_BIN="$BINARIES_DIR/opencode-x86_64-apple-darwin"
    fi
    ;;
esac

if [ -f "$OPENCODE_BIN" ]; then
  echo "  - opencode binary already present, skipping download"
elif [ -f "$SCRIPT_DIR/download-opencode.sh" ]; then
  echo "==> Downloading opencode binary..."
  "$SCRIPT_DIR/download-opencode.sh"
else
  echo "  ! opencode binary not found at $OPENCODE_BIN"
  echo "    Get it from: https://github.com/anomalyco/opencode/releases"
fi

echo "==> Build complete!"
ls -la "$BINARIES_DIR"
