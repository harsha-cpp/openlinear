#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
API_DIR="$ROOT_DIR/apps/api"
BINARIES_DIR="$ROOT_DIR/apps/desktop/src-tauri/binaries"

echo "==> Building TypeScript..."
pnpm --filter @openlinear/api build

echo "==> Bundling with esbuild (ESM -> CJS)..."
cd "$API_DIR"

# Create a stub for ssh2 because it requires native addons that fail in pkg
echo "module.exports = { Client: class Client {} };" > stub-ssh2.cjs

npx esbuild src/index.ts --bundle --platform=node --target=node18 --outfile=dist/bundle.cjs --format=cjs --alias:ssh2=./stub-ssh2.cjs --define:import.meta.dirname=__dirname

echo "==> Copying Prisma engine and schema..."
# Dynamically find the .prisma/client directory regardless of version
PRISMA_CLIENT=$(find "$ROOT_DIR/node_modules/.pnpm" -path "*/@prisma+client@*/node_modules/.prisma/client" -type d 2>/dev/null | head -n 1)
if [ -z "$PRISMA_CLIENT" ]; then
  # Fallback: check packages/db local node_modules
  PRISMA_CLIENT="$ROOT_DIR/packages/db/node_modules/.prisma/client"
fi
echo "  Prisma client dir: $PRISMA_CLIENT"

for ENGINE in "$PRISMA_CLIENT"/libquery_engine-*.so.node "$PRISMA_CLIENT"/libquery_engine-*.node; do
  if [ -f "$ENGINE" ]; then
    cp "$ENGINE" dist/
    echo "  Copied $(basename "$ENGINE")"
  fi
done
if [ -f "$PRISMA_CLIENT/schema.prisma" ]; then
  cp "$PRISMA_CLIENT/schema.prisma" dist/
  echo "  Copied schema.prisma"
fi

echo "==> Building binaries with pkg..."
npx @yao-pkg/pkg dist/bundle.cjs --target node18-macos-x64 --output dist/api-macos-x64
npx @yao-pkg/pkg dist/bundle.cjs --target node18-macos-arm64 --output dist/api-macos-arm64
npx @yao-pkg/pkg dist/bundle.cjs --target node18-linux-x64 --output dist/api-linux-x64

cd "$ROOT_DIR"

echo "==> Creating binaries directory..."
mkdir -p "$BINARIES_DIR"

echo "==> Copying and renaming binaries with Tauri target triples..."

# pkg outputs: api-macos-x64, api-macos-arm64, api-linux-x64
# Tauri expects: openlinear-api-{target-triple}

# Mac Intel
if [ -f "$API_DIR/dist/api-macos-x64" ]; then
  cp "$API_DIR/dist/api-macos-x64" "$BINARIES_DIR/openlinear-api-x86_64-apple-darwin"
  echo "  - openlinear-api-x86_64-apple-darwin"
fi

# Mac ARM
if [ -f "$API_DIR/dist/api-macos-arm64" ]; then
  cp "$API_DIR/dist/api-macos-arm64" "$BINARIES_DIR/openlinear-api-aarch64-apple-darwin"
  echo "  - openlinear-api-aarch64-apple-darwin"
fi

# Linux x64
if [ -f "$API_DIR/dist/api-linux-x64" ]; then
  cp "$API_DIR/dist/api-linux-x64" "$BINARIES_DIR/openlinear-api-x86_64-unknown-linux-gnu"
  echo "  - openlinear-api-x86_64-unknown-linux-gnu"
fi

echo "==> Build complete!"
ls -la "$BINARIES_DIR"
