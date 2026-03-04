#!/bin/bash
# OpenLinear Installer Script
# Usage: curl -fsSL https://rixie.in/api/install | bash

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
REPO="kaizen403/openlinear"
API_URL="https://api.github.com/repos/${REPO}/releases/latest"
INSTALL_DIR="${HOME}/.local/bin"
BIN_NAME="openlinear"

echo -e "${BLUE}OpenLinear Installer${NC}"
echo "===================="
echo ""

# Detect OS and architecture
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$OS" in
    linux)
        case "$ARCH" in
            x86_64) PLATFORM="linux-x64" ;;
            aarch64|arm64) PLATFORM="linux-arm64" ;;
            *) echo -e "${RED}Unsupported architecture: $ARCH${NC}"; exit 1 ;;
        esac
        ;;
    darwin)
        case "$ARCH" in
            x86_64) PLATFORM="macos-x64" ;;
            arm64) PLATFORM="macos-arm64" ;;
            *) echo -e "${RED}Unsupported architecture: $ARCH${NC}"; exit 1 ;;
        esac
        ;;
    *)
        echo -e "${RED}Unsupported OS: $OS${NC}"
        exit 1
        ;;
esac

echo -e "Detected: ${YELLOW}$PLATFORM${NC}"
echo ""

# Check for required tools
if ! command -v curl &> /dev/null && ! command -v wget &> /dev/null; then
    echo -e "${RED}Error: curl or wget is required${NC}"
    exit 1
fi

# Get latest release
if command -v curl &> /dev/null; then
    RELEASE_DATA=$(curl -s "$API_URL")
else
    RELEASE_DATA=$(wget -qO- "$API_URL")
fi

if [ -z "$RELEASE_DATA" ] || echo "$RELEASE_DATA" | grep -q "Not Found"; then
    echo -e "${RED}Error: Failed to fetch release information${NC}"
    exit 1
fi

# Parse version
VERSION=$(echo "$RELEASE_DATA" | grep -o '"tag_name": "[^"]*"' | cut -d'"' -f4)
if [ -z "$VERSION" ]; then
    echo -e "${RED}Error: Failed to parse version${NC}"
    exit 1
fi

echo -e "Latest version: ${GREEN}$VERSION${NC}"
echo ""

# Find asset URL
ASSET_PATTERN="${PLATFORM}"
ASSET_URL=$(echo "$RELEASE_DATA" | grep -o '"browser_download_url": "[^"]*' | grep "$ASSET_PATTERN" | head -1 | cut -d'"' -f4)

if [ -z "$ASSET_URL" ]; then
    echo -e "${YELLOW}No prebuilt binary found for $PLATFORM${NC}"
    echo "Falling back to npm installation..."
    echo ""
    
    if ! command -v npm &> /dev/null; then
        echo -e "${RED}Error: npm is not installed${NC}"
        echo "Please install Node.js first: https://nodejs.org"
        exit 1
    fi
    
    echo -e "${BLUE}Installing via npm...${NC}"
    npm install -g openlinear
    
    if command -v openlinear &> /dev/null; then
        echo ""
        echo -e "${GREEN}✓ OpenLinear installed successfully!${NC}"
        echo ""
        echo "Run 'openlinear --help' to get started"
    else
        echo -e "${RED}Error: Installation failed${NC}"
        exit 1
    fi
    
    exit 0
fi

echo -e "${BLUE}Downloading...${NC}"

# Create temp directory
TMP_DIR=$(mktemp -d)
trap "rm -rf $TMP_DIR" EXIT

# Download
DOWNLOAD_FILE="$TMP_DIR/openlinear-${PLATFORM}.tar.gz"

if command -v curl &> /dev/null; then
    curl -fsSL "$ASSET_URL" -o "$DOWNLOAD_FILE" --progress-bar
else
    wget -q --show-progress "$ASSET_URL" -O "$DOWNLOAD_FILE"
fi

echo ""
echo -e "${BLUE}Extracting...${NC}"

# Extract
tar -xzf "$DOWNLOAD_FILE" -C "$TMP_DIR"

# Install
mkdir -p "$INSTALL_DIR"

# Find the binary in extracted files
if [ -f "$TMP_DIR/openlinear" ]; then
    BINARY_PATH="$TMP_DIR/openlinear"
elif [ -f "$TMP_DIR/openlinear-desktop" ]; then
    BINARY_PATH="$TMP_DIR/openlinear-desktop"
else
    BINARY_PATH=$(find "$TMP_DIR" -type f -executable | head -1)
fi

cp "$BINARY_PATH" "$INSTALL_DIR/$BIN_NAME"
chmod +x "$INSTALL_DIR/$BIN_NAME"

# Check if install dir is in PATH
if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
    echo ""
    echo -e "${YELLOW}Warning: $INSTALL_DIR is not in your PATH${NC}"
    echo ""
    echo "Add the following to your shell profile (~/.bashrc, ~/.zshrc, etc.):"
    echo ""
    echo "    export PATH=\"\$PATH:$INSTALL_DIR\""
    echo ""
fi

echo ""
echo -e "${GREEN}✓ OpenLinear $VERSION installed successfully!${NC}"
echo ""
echo "Location: $INSTALL_DIR/$BIN_NAME"
echo ""

if command -v openlinear &> /dev/null; then
    echo "Run 'openlinear --help' to get started"
else
    echo "Please restart your terminal or run:"
    echo "    export PATH=\"\$PATH:$INSTALL_DIR\""
fi
