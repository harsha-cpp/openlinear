export async function GET() {
  const installScript = `#!/usr/bin/env bash
# OpenLinear Installer Script
# Usage: curl -fsSL https://raw.githubusercontent.com/kaizen403/openlinear/main/install.sh | bash

set -euo pipefail

RED='\\033[0;31m'
GREEN='\\033[0;32m'
BLUE='\\033[0;34m'
YELLOW='\\033[1;33m'
NC='\\033[0m'

REPO='kaizen403/openlinear'
API_URL="https://api.github.com/repos/\${REPO}/releases/latest"
RELEASES_URL="https://github.com/\${REPO}/releases/latest"
INSTALL_DIR="\${HOME}/.openlinear"
APPIMAGE_PATH="\${INSTALL_DIR}/openlinear.AppImage"
MACOS_APP_PATH="\${INSTALL_DIR}/OpenLinear.app"
MACOS_BINARY_PATH="\${MACOS_APP_PATH}/Contents/MacOS/OpenLinear"
BIN_DIR="\${HOME}/.local/bin"
BIN_PATH="\${BIN_DIR}/openlinear"

echo -e "\${BLUE}OpenLinear Installer\${NC}"
echo "===================="
echo ""

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

INSTALL_MODE=""
ASSET_PATTERN=""
ASSET_LABEL=""

case "$OS/$ARCH" in
    linux/x86_64)
        INSTALL_MODE="linux-appimage"
        ASSET_PATTERN='-x86_64\\.AppImage$'
        ASSET_LABEL='Linux AppImage'
        ;;
    darwin/x86_64)
        INSTALL_MODE="macos-app"
        ASSET_PATTERN='-x86_64\\.app\\.tar\\.gz$'
        ASSET_LABEL='macOS app bundle'
        ;;
    darwin/arm64)
        INSTALL_MODE="macos-app"
        ASSET_PATTERN='-aarch64\\.app\\.tar\\.gz$'
        ASSET_LABEL='macOS app bundle'
        ;;
    *)
        echo -e "\${RED}This installer currently supports macOS (Apple Silicon / Intel) and Linux x86_64 only.\${NC}"
        echo "Use one of these instead:"
        echo "  npm install -g openlinear"
        echo "  paru -S openlinear-bin"
        echo "  \${RELEASES_URL}"
        exit 1
        ;;
esac

echo -e "Detected: \${YELLOW}$OS / $ARCH\${NC}"
echo ""

if ! command -v curl >/dev/null 2>&1; then
    echo -e "\${RED}Error: curl is required\${NC}"
    exit 1
fi

if [ "$INSTALL_MODE" = "macos-app" ] && ! command -v tar >/dev/null 2>&1; then
    echo -e "\${RED}Error: tar is required on macOS installs\${NC}"
    exit 1
fi

echo -e "\${BLUE}Fetching latest release metadata...\${NC}"
RELEASE_DATA=$(curl -fsSL -H "Accept: application/vnd.github+json" -H "User-Agent: openlinear-installer" "$API_URL")

if [ -z "$RELEASE_DATA" ] || echo "$RELEASE_DATA" | grep -q "Not Found"; then
    echo -e "\${RED}Error: Failed to fetch release information\${NC}"
    exit 1
fi

VERSION=$(echo "$RELEASE_DATA" | grep -o '"tag_name":[[:space:]]*"[^"]*"' | cut -d'"' -f4)
ASSET_URL=$(echo "$RELEASE_DATA" | grep -o '"browser_download_url":[[:space:]]*"[^"]*' | cut -d'"' -f4 | grep -E -- "$ASSET_PATTERN" | head -1)

if [ -z "$VERSION" ]; then
    echo -e "\${RED}Error: Failed to parse version\${NC}"
    exit 1
fi

echo -e "Latest version: \${GREEN}$VERSION\${NC}"
echo ""

if [ -z "$ASSET_URL" ]; then
    echo -e "\${RED}No \${ASSET_LABEL} found in the latest release.\${NC}"
    echo "Open \${RELEASES_URL} and download it manually."
    exit 1
fi

echo -e "\${BLUE}Downloading \${ASSET_LABEL}...\${NC}"

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

mkdir -p "$INSTALL_DIR" "$BIN_DIR"

if [ "$INSTALL_MODE" = "linux-appimage" ]; then
    DOWNLOAD_FILE="$TMP_DIR/openlinear.AppImage"
    curl -fL "$ASSET_URL" -o "$DOWNLOAD_FILE" --progress-bar
    echo ""
    install -m 755 "$DOWNLOAD_FILE" "$APPIMAGE_PATH"

    cat > "$BIN_PATH" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

APPIMAGE_PATH="\${HOME}/.openlinear/openlinear.AppImage"

if [ ! -x "$APPIMAGE_PATH" ]; then
  echo "OpenLinear AppImage not found at $APPIMAGE_PATH" >&2
  echo "Reinstall with: curl -fsSL https://raw.githubusercontent.com/kaizen403/openlinear/main/install.sh | bash" >&2
  exit 1
fi

IS_WAYLAND=false
if [ "\${XDG_SESSION_TYPE:-}" = "wayland" ] || [ -n "\${WAYLAND_DISPLAY:-}" ]; then
  IS_WAYLAND=true
fi

export WEBKIT_DISABLE_DMABUF_RENDERER=1

if [ "$IS_WAYLAND" = true ] && [ -z "\${LD_PRELOAD:-}" ]; then
  for lib in \
    /usr/lib/libwayland-client.so \
    /usr/lib64/libwayland-client.so \
    /usr/lib/x86_64-linux-gnu/libwayland-client.so; do
    if [ -f "$lib" ]; then
      export LD_PRELOAD="$lib"
      break
    fi
  done

  if [ -z "\${LD_PRELOAD:-}" ]; then
    export GDK_BACKEND=x11
    export WEBKIT_DISABLE_COMPOSITING_MODE=1
  fi
else
  export WEBKIT_DISABLE_COMPOSITING_MODE=1
fi

export APPIMAGE_EXTRACT_AND_RUN=1
exec "$APPIMAGE_PATH" "$@"
EOF
else
    DOWNLOAD_FILE="$TMP_DIR/OpenLinear.app.tar.gz"
    EXTRACT_DIR="$TMP_DIR/extracted"

    curl -fL "$ASSET_URL" -o "$DOWNLOAD_FILE" --progress-bar
    echo ""

    mkdir -p "$EXTRACT_DIR"
    tar -xzf "$DOWNLOAD_FILE" -C "$EXTRACT_DIR"

    APP_BUNDLE=$(find "$EXTRACT_DIR" -maxdepth 1 -type d -name '*.app' | head -n 1)
    if [ -z "$APP_BUNDLE" ]; then
        echo -e "\${RED}Failed to extract OpenLinear.app from the downloaded archive.\${NC}"
        exit 1
    fi

    rm -rf "$MACOS_APP_PATH"
    mv "$APP_BUNDLE" "$MACOS_APP_PATH"
    chmod +x "$MACOS_BINARY_PATH"

    cat > "$BIN_PATH" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

APP_PATH="\${HOME}/.openlinear/OpenLinear.app/Contents/MacOS/OpenLinear"

if [ ! -x "$APP_PATH" ]; then
  echo "OpenLinear macOS app not found at $APP_PATH" >&2
  echo "Reinstall with: curl -fsSL https://raw.githubusercontent.com/kaizen403/openlinear/main/install.sh | bash" >&2
  exit 1
fi

exec "$APP_PATH" "$@"
EOF
fi

chmod +x "$BIN_PATH"

if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
    echo ""
    echo -e "\${YELLOW}Warning: $BIN_DIR is not in your PATH\${NC}"
    echo ""
    echo "Add the following to your shell profile (~/.bashrc, ~/.zshrc, etc.):"
    echo ""
    echo '    export PATH="$HOME/.local/bin:$PATH"'
    echo ""
fi

echo ""
echo -e "\${GREEN}✓ OpenLinear $VERSION installed successfully!\${NC}"
echo ""
if [ "$INSTALL_MODE" = "linux-appimage" ]; then
    echo "AppImage: $APPIMAGE_PATH"
else
    echo "App bundle: $MACOS_APP_PATH"
fi
echo "Launcher: $BIN_PATH"
echo ""
echo "Run 'openlinear'"
`

  return new Response(installScript, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
