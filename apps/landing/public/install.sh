#!/bin/bash
# OpenLinear Desktop App Installer
# Usage: curl -fsSL https://rixie.in/api/install | bash

set -e

REPO="kaizen403/openlinear"
API_URL="https://api.github.com/repos/${REPO}/releases/latest"
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

echo "Fetching latest release..."

if command -v curl &> /dev/null; then
    RELEASE_DATA=$(curl -s "$API_URL")
else
    RELEASE_DATA=$(wget -qO- "$API_URL")
fi

if [ -z "$RELEASE_DATA" ] || echo "$RELEASE_DATA" | grep -q "Not Found"; then
    echo "Error: Failed to fetch release information"
    exit 1
fi

VERSION=$(echo "$RELEASE_DATA" | grep -o '"tag_name": "[^"]*"' | cut -d'"' -f4)
if [ -z "$VERSION" ]; then
    echo "Error: Failed to parse version"
    exit 1
fi

echo "Latest version: $VERSION"
echo ""

ASSET_URL=$(echo "$RELEASE_DATA" | grep -o '"browser_download_url": "[^"]*\.AppImage"' | grep -i "linux.*${PLATFORM}\|${PLATFORM}.*linux\|appimage" | head -1 | cut -d'"' -f4)

if [ -z "$ASSET_URL" ]; then
    echo "Error: No AppImage found for Linux $PLATFORM"
    exit 1
fi

echo "Downloading OpenLinear..."
echo ""

mkdir -p "$INSTALL_DIR"

if command -v curl &> /dev/null; then
    curl -fsSL "$ASSET_URL" -o "$INSTALL_DIR/$BINARY_NAME" --progress-bar
else
    wget -q --show-progress "$ASSET_URL" -O "$INSTALL_DIR/$BINARY_NAME"
fi

chmod +x "$INSTALL_DIR/$BINARY_NAME"

echo ""
echo "✓ OpenLinear $VERSION installed successfully!"
echo ""
echo "Location: $INSTALL_DIR/$BINARY_NAME"
echo ""
echo "Run OpenLinear with:"
echo "  $INSTALL_DIR/$BINARY_NAME"
echo ""
echo "Or install the npm wrapper for easier access:"
echo "  npm install -g openlinear"
