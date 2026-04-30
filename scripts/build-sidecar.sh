#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
SIDECAR_DIR="$ROOT_DIR/apps/sidecar"
DB_DIR="$ROOT_DIR/packages/db"
BINARIES_DIR="$ROOT_DIR/apps/desktop/src-tauri/binaries"

OS="$(uname -s)"
ARCH="$(uname -m)"

echo "==> Detected platform: $OS / $ARCH"

echo "==> Building TypeScript..."
pnpm --filter @openlinear/sidecar build

echo "==> Bundling with esbuild (ESM -> CJS)..."
cd "$SIDECAR_DIR"
npx esbuild src/index.ts --bundle --platform=node --target=node18 --outfile=dist/bundle.cjs --format=cjs

echo "==> Resolving Prisma generated client path..."
PRISMA_RUNTIME_DIR="$DB_DIR/generated/prisma/client"

if [ ! -d "$PRISMA_RUNTIME_DIR" ]; then
  echo "  ! Prisma generated client not found at $PRISMA_RUNTIME_DIR"
  echo "  ! Run 'pnpm --filter @openlinear/db db:generate' first."
  exit 1
fi

echo "  - Prisma runtime dir: $PRISMA_RUNTIME_DIR"

echo "==> Copying Prisma client artifacts (schema + WASM query compiler)..."
mkdir -p dist
if [ -f "$PRISMA_RUNTIME_DIR/schema.prisma" ]; then
  cp "$PRISMA_RUNTIME_DIR/schema.prisma" dist/
  echo "  - Copied schema.prisma"
fi
for wasm in "$PRISMA_RUNTIME_DIR"/query_compiler_fast_bg.wasm; do
  if [ -f "$wasm" ]; then
    cp "$wasm" dist/
    echo "  - Copied $(basename "$wasm")"
  fi
done

case "$OS" in
  Darwin)
    echo "==> Building macOS binary with pkg..."
    if [ "$ARCH" = "arm64" ]; then
      npx @yao-pkg/pkg dist/bundle.cjs --target node18-macos-arm64 --output dist/sidecar-macos-arm64
    else
      npx @yao-pkg/pkg dist/bundle.cjs --target node18-macos-x64 --output dist/sidecar-macos-x64
    fi
    ;;
  Linux)
    echo "==> Building Linux binary with pkg..."
    npx @yao-pkg/pkg dist/bundle.cjs --target node18-linux-x64 --output dist/sidecar-linux-x64
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

echo "==> Downloading opencode binary..."
"$SCRIPT_DIR/download-opencode.sh"

echo "==> Build complete!"
ls -la "$BINARIES_DIR"
