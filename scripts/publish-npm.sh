#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
PKG_DIR="$ROOT_DIR/packages/openlinear"

LOCAL_VERSION=$(node -p "require('$PKG_DIR/package.json').version")
REMOTE_VERSION=$(npm view openlinear version 2>/dev/null || echo "0.0.0")

echo "Local:  $LOCAL_VERSION"
echo "Remote: $REMOTE_VERSION"

if [ "$LOCAL_VERSION" = "$REMOTE_VERSION" ]; then
  echo "Already published. Nothing to do."
  exit 0
fi

echo ""
echo "Publishing openlinear@$LOCAL_VERSION..."
pnpm --filter openlinear publish --access public --no-git-checks
echo ""
echo "✓ Published openlinear@$LOCAL_VERSION"
