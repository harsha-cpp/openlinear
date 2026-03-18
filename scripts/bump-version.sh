#!/usr/bin/env bash
# bump-version.sh — Bump the patch version across all version files
#
# Usage:
#   ./scripts/bump-version.sh           # auto-increment patch
#   ./scripts/bump-version.sh 0.2.0     # set explicit version
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

NPM_PKG="$ROOT_DIR/packages/openlinear/package.json"
TAURI_CONF="$ROOT_DIR/apps/desktop/src-tauri/tauri.conf.json"

CURRENT=$(node -p "require('$NPM_PKG').version")

if [ -n "${1:-}" ]; then
  NEXT="$1"
else
  IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
  NEXT="$MAJOR.$MINOR.$((PATCH + 1))"
fi

if [ "$CURRENT" = "$NEXT" ]; then
  echo "Already at $CURRENT, nothing to bump"
  exit 0
fi

echo "Bumping $CURRENT → $NEXT"

node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('$NPM_PKG', 'utf8'));
  pkg.version = '$NEXT';
  fs.writeFileSync('$NPM_PKG', JSON.stringify(pkg, null, 2) + '\n');
"

node -e "
  const fs = require('fs');
  const conf = JSON.parse(fs.readFileSync('$TAURI_CONF', 'utf8'));
  conf.version = '$NEXT';
  fs.writeFileSync('$TAURI_CONF', JSON.stringify(conf, null, 2) + '\n');
"

bash "$SCRIPT_DIR/sync-aur-metadata.sh" "$NEXT"

echo "Done — all files bumped to $NEXT"
