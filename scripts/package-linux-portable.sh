#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

VERSION="${1:?usage: package-linux-portable.sh <version> <output-tarball>}"
OUTPUT_TARBALL="${2:?usage: package-linux-portable.sh <version> <output-tarball>}"
TARGET_TRIPLE="${3:-x86_64-unknown-linux-gnu}"

APP_BINARY="$ROOT_DIR/apps/desktop/src-tauri/target/release/openlinear-desktop"
SIDECAR_BINARY="$ROOT_DIR/apps/desktop/src-tauri/binaries/openlinear-sidecar-${TARGET_TRIPLE}"
OPENCODE_BINARY="$ROOT_DIR/apps/desktop/src-tauri/binaries/opencode-${TARGET_TRIPLE}"
ICON_SOURCE="$ROOT_DIR/apps/desktop/src-tauri/icons/icon.png"

for required in "$APP_BINARY" "$SIDECAR_BINARY" "$OPENCODE_BINARY" "$ICON_SOURCE"; do
  if [ ! -f "$required" ]; then
    echo "Required file missing: $required" >&2
    exit 1
  fi
done

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

BUNDLE_DIR="$TMP_DIR/openlinear-linux-x64"
ICON_DIR="$BUNDLE_DIR/share/icons/hicolor/512x512/apps"

mkdir -p "$ICON_DIR" "$(dirname "$OUTPUT_TARBALL")"

install -m 755 "$APP_BINARY" "$BUNDLE_DIR/openlinear-desktop"
install -m 755 "$SIDECAR_BINARY" "$BUNDLE_DIR/openlinear-sidecar"
install -m 755 "$OPENCODE_BINARY" "$BUNDLE_DIR/opencode-${TARGET_TRIPLE}"
install -m 644 "$ICON_SOURCE" "$ICON_DIR/openlinear.png"

printf '%s\n' "$VERSION" > "$BUNDLE_DIR/VERSION"

tar -C "$TMP_DIR" -czf "$OUTPUT_TARBALL" "$(basename "$BUNDLE_DIR")"
