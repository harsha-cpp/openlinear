#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SIDECAR_DIR="$(dirname "$SCRIPT_DIR")/apps/sidecar"

cd "$SIDECAR_DIR"
rm -f dist/sidecar-entry.cjs
npx esbuild src/index.ts \
  --bundle \
  --platform=node \
  --target=node18 \
  --outfile=dist/sidecar-entry.cjs \
  --format=cjs \
  '--define:import.meta.dirname=""'

echo "sidecar-entry.cjs built ($(du -sh dist/sidecar-entry.cjs | cut -f1))"
