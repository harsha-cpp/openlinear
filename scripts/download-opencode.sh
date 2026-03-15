#!/bin/bash
set -euo pipefail

# Download opencode binary for the current platform
# Used by build-sidecar.sh when no opencode binary is present

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BINARIES_DIR="$ROOT_DIR/apps/desktop/src-tauri/binaries"

OS="$(uname -s)"
ARCH="$(uname -m)"

# Determine target triple
case "$OS" in
  Darwin)
    if [ "$ARCH" = "arm64" ]; then
      TRIPLE="aarch64-apple-darwin"
    else
      TRIPLE="x86_64-apple-darwin"
    fi
    ;;
  Linux)
    TRIPLE="x86_64-unknown-linux-gnu"
    ;;
  *)
    echo "Unsupported OS: $OS"
    exit 1
    ;;
esac

TARGET="$BINARIES_DIR/opencode-$TRIPLE"

if [ -f "$TARGET" ]; then
  echo "opencode binary already exists at $TARGET"
  exit 0
fi

# Try system opencode first
if command -v opencode &>/dev/null; then
  SYS_OPENCODE="$(command -v opencode)"
  # Follow wrapper scripts to find the real binary
  if file "$SYS_OPENCODE" | grep -q "shell script"; then
    REAL_BIN=$(grep -oP 'exec\s+\K\S+' "$SYS_OPENCODE" 2>/dev/null || true)
    if [ -n "$REAL_BIN" ] && [ -f "$REAL_BIN" ]; then
      SYS_OPENCODE="$REAL_BIN"
    fi
  fi
  if file "$SYS_OPENCODE" | grep -q "ELF\|Mach-O"; then
    echo "Copying system opencode from $SYS_OPENCODE"
    mkdir -p "$BINARIES_DIR"
    cp "$SYS_OPENCODE" "$TARGET"
    chmod +x "$TARGET"
    echo "Done: $TARGET"
    exit 0
  fi
fi

# Download from GitHub releases
echo "Downloading opencode binary..."
OPENCODE_REPO="anomalyco/opencode"
RELEASE_URL="https://github.com/$OPENCODE_REPO/releases/latest"
RELEASE_API_URL="https://api.github.com/repos/$OPENCODE_REPO/releases/latest"
LATEST_TAG=$(
  curl -fsSL \
    -H "Accept: application/vnd.github+json" \
    -H "User-Agent: openlinear-build" \
    "$RELEASE_API_URL" |
    sed -n 's/.*"tag_name":[[:space:]]*"\([^"]*\)".*/\1/p' |
    head -n 1
)

if [ -z "$LATEST_TAG" ]; then
  echo "Failed to determine latest opencode version"
  echo "Please download manually from: $RELEASE_URL"
  exit 1
fi

echo "Latest version: $LATEST_TAG"

# opencode releases use format: opencode-linux-x64, opencode-darwin-arm64, etc.
case "$OS-$ARCH" in
  Linux-x86_64) ASSET="opencode-linux-x64.tar.gz" ;;
  Darwin-arm64) ASSET="opencode-darwin-arm64.zip" ;;
  Darwin-x86_64) ASSET="opencode-darwin-x64.zip" ;;
  *) echo "No pre-built binary for $OS-$ARCH"; exit 1 ;;
esac

DOWNLOAD_URL="https://github.com/$OPENCODE_REPO/releases/download/$LATEST_TAG/$ASSET"
echo "Downloading $DOWNLOAD_URL ..."

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
ARCHIVE_PATH="$TMP_DIR/$ASSET"

mkdir -p "$BINARIES_DIR"
curl -L --fail -o "$ARCHIVE_PATH" "$DOWNLOAD_URL"

case "$ASSET" in
  *.tar.gz)
    tar -xzf "$ARCHIVE_PATH" -C "$TMP_DIR"
    ;;
  *.zip)
    if ! command -v unzip >/dev/null 2>&1; then
      echo "unzip is required to extract $ASSET"
      exit 1
    fi
    unzip -q "$ARCHIVE_PATH" -d "$TMP_DIR"
    ;;
esac

BINARY_PATH=$(find "$TMP_DIR" -maxdepth 2 -type f -name 'opencode*' ! -name '*.sig' | head -n 1)

if [ -z "$BINARY_PATH" ] || [ ! -f "$BINARY_PATH" ]; then
  echo "Failed to extract opencode binary from $ASSET"
  exit 1
fi

install -m 755 "$BINARY_PATH" "$TARGET"

echo "Done: $TARGET ($($TARGET --version 2>/dev/null || echo 'version unknown'))"
