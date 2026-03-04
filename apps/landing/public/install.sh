#!/bin/bash
# OpenLinear Desktop App Installer
# Usage: curl -fsSL https://rixie.in/api/install | bash

set -e

REPO="kaizen403/openlinear"
INSTALL_DIR="${HOME}/.openlinear"
BINARY_NAME="openlinear.AppImage"

echo "OpenLinear Installer"
echo "===================="
echo ""

OS=$(uname -s)
ARCH=$(uname -m)

if [ "$OS" != "Linux" ]; then
    echo "Error: OpenLinear desktop app is currently only available for Linux"
    echo "Your OS: $OS"
    exit 1
fi

case "$ARCH" in
    x86_64) PLATFORM="amd64" ;;
    aarch64|arm64) PLATFORM="arm64" ;;
    *) echo "Error: Unsupported architecture: $ARCH"; exit 1 ;;
esac

echo "Detected: Linux $PLATFORM"
echo ""

if ! command -v curl &> /dev/null && ! command -v wget &> /dev/null; then
    echo "Error: curl or wget is required"
    exit 1
fi

echo "Downloading latest OpenLinear..."
echo ""

mkdir -p "$INSTALL_DIR"

LATEST_URL="https://github.com/${REPO}/releases/latest/download/openlinear_${PLATFORM}.AppImage"

echo "URL: ${LATEST_URL}"
echo ""

if command -v curl &> /dev/null; then
    curl -fsSL "$LATEST_URL" -o "$INSTALL_DIR/$BINARY_NAME" --progress-bar || {
        echo ""
        echo "Error: Failed to download. Trying alternative URL..."
        ALT_URL="https://github.com/${REPO}/releases/download/latest/openlinear_${PLATFORM}.AppImage"
        curl -fsSL "$ALT_URL" -o "$INSTALL_DIR/$BINARY_NAME" --progress-bar
    }
else
    wget -q --show-progress "$LATEST_URL" -O "$INSTALL_DIR/$BINARY_NAME" || {
        echo ""
        echo "Error: Failed to download. Trying alternative URL..."
        ALT_URL="https://github.com/${REPO}/releases/download/latest/openlinear_${PLATFORM}.AppImage"
        wget -q --show-progress "$ALT_URL" -O "$INSTALL_DIR/$BINARY_NAME"
    }
fi

chmod +x "$INSTALL_DIR/$BINARY_NAME"

echo ""
echo "✓ OpenLinear installed successfully!"
echo ""
echo "Location: $INSTALL_DIR/$BINARY_NAME"
echo ""
echo "Run OpenLinear with:"
echo "  $INSTALL_DIR/$BINARY_NAME"
echo ""
echo "Or install the npm wrapper for easier access:"
echo "  npm install -g openlinear"
echo ""
echo "Then simply run: openlinear"
