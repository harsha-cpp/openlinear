#!/bin/bash
# OpenLinear Desktop App Installer
# Usage: curl -fsSL https://rixie.in/api/install | bash

set -e

INSTALL_DIR="${HOME}/.openlinear"

echo "OpenLinear Installer"
echo "===================="
echo ""

OS=$(uname -s)
ARCH=$(uname -m)

if [ "$OS" != "Linux" ]; then
    echo "Error: This installer is for Linux only"
    echo "Detected: $OS"
    exit 1
fi

echo "Detected: Linux $ARCH"
echo ""

if ! command -v git &> /dev/null; then
    echo "Error: git is required"
    exit 1
fi

if ! command -v cargo &> /dev/null; then
    echo "Error: Rust/Cargo is required"
    echo "Install from: https://rustup.rs/"
    exit 1
fi

if ! command -v pnpm &> /dev/null; then
    echo "Error: pnpm is required"
    echo "Install: npm install -g pnpm"
    exit 1
fi

echo "Cloning OpenLinear repository..."
echo ""

TMP_DIR=$(mktemp -d)
trap "rm -rf $TMP_DIR" EXIT

git clone --depth 1 https://github.com/kaizen403/openlinear.git "$TMP_DIR/openlinear" &> /dev/null

cd "$TMP_DIR/openlinear"

echo "Installing dependencies..."
echo ""

pnpm install &> /dev/null

echo "Building desktop app (this may take a few minutes)..."
echo ""

pnpm --filter @openlinear/desktop build &> /dev/null

mkdir -p "$INSTALL_DIR"

BINARY_PATH="$TMP_DIR/openlinear/apps/desktop/src-tauri/target/release/openlinear-desktop"

if [ ! -f "$BINARY_PATH" ]; then
    echo "Error: Build failed - binary not found"
    exit 1
fi

cp "$BINARY_PATH" "$INSTALL_DIR/openlinear"
chmod +x "$INSTALL_DIR/openlinear"

echo ""
echo "✓ OpenLinear installed successfully!"
echo ""
echo "Location: $INSTALL_DIR/openlinear"
echo ""
echo "Run OpenLinear with:"
echo "  $INSTALL_DIR/openlinear"
echo ""
echo "Or add to your PATH:"
echo "  export PATH=\"\$PATH:$INSTALL_DIR\""
