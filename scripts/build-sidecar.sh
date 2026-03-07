#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
SIDECAR_DIR="$ROOT_DIR/apps/sidecar"
BINARIES_DIR="$ROOT_DIR/apps/desktop/src-tauri/binaries"

OS="$(uname -s)"
ARCH="$(uname -m)"

echo "==> Detected platform: $OS / $ARCH"

echo "==> Building TypeScript..."
pnpm --filter @openlinear/sidecar build

echo "==> Bundling with esbuild (ESM -> CJS)..."
cd "$SIDECAR_DIR"
npx esbuild src/index.ts --bundle --platform=node --target=node18 --outfile=dist/bundle.cjs --format=cjs

echo "==> Copying Prisma engine and schema..."
PRISMA_CLIENT="$ROOT_DIR/node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/.prisma/client"

copy_prisma_engine() {
  local pattern="$1"
  local found=false
  for engine in "$PRISMA_CLIENT"/$pattern; do
    if [ -f "$engine" ]; then
      cp "$engine" dist/
      echo "  - Copied $(basename "$engine")"
      found=true
    fi
  done
  if [ "$found" = false ]; then
    echo "  ! Warning: No Prisma engine found matching $pattern"
  fi
}

if [ -f "$PRISMA_CLIENT/schema.prisma" ]; then
  cp "$PRISMA_CLIENT/schema.prisma" dist/
fi

case "$OS" in
  Darwin)
    echo "==> Copying macOS Prisma engine..."
    copy_prisma_engine "libquery_engine-darwin*.dylib.node"

    echo "==> Building macOS binary with pkg..."
    if [ "$ARCH" = "arm64" ]; then
      npx @yao-pkg/pkg dist/bundle.cjs --target node18-macos-arm64 --output dist/sidecar-macos-arm64
    else
      npx @yao-pkg/pkg dist/bundle.cjs --target node18-macos-x64 --output dist/sidecar-macos-x64
    fi
    ;;
  Linux)
    echo "==> Copying Linux Prisma engine..."
    copy_prisma_engine "libquery_engine-debian-openssl-*.so.node"
    copy_prisma_engine "libquery_engine-linux-musl-openssl-*.so.node"

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

# Mac Intel
if [ -f "$SIDECAR_DIR/dist/sidecar-macos-x64" ]; then
  cp "$SIDECAR_DIR/dist/sidecar-macos-x64" "$BINARIES_DIR/openlinear-sidecar-x86_64-apple-darwin"
  echo "  - openlinear-sidecar-x86_64-apple-darwin"
fi

# Mac ARM
if [ -f "$SIDECAR_DIR/dist/sidecar-macos-arm64" ]; then
  cp "$SIDECAR_DIR/dist/sidecar-macos-arm64" "$BINARIES_DIR/openlinear-sidecar-aarch64-apple-darwin"
  echo "  - openlinear-sidecar-aarch64-apple-darwin"
fi

# Linux x64
if [ -f "$SIDECAR_DIR/dist/sidecar-linux-x64" ]; then
  cp "$SIDECAR_DIR/dist/sidecar-linux-x64" "$BINARIES_DIR/openlinear-sidecar-x86_64-unknown-linux-gnu"
  echo "  - openlinear-sidecar-x86_64-unknown-linux-gnu"
fi

echo "==> Downloading opencode binary..."
"$SCRIPT_DIR/download-opencode.sh"

echo "==> Build complete!"
ls -la "$BINARIES_DIR"
