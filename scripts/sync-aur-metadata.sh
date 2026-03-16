#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
PKGBUILD="$ROOT_DIR/packaging/aur/openlinear-bin/PKGBUILD"
SRCINFO="$ROOT_DIR/packaging/aur/openlinear-bin/.SRCINFO"

cd "$ROOT_DIR"

PACKAGE_VERSION="$(node -p "require('./packages/openlinear/package.json').version")"
TAURI_VERSION="$(node -p "require('./apps/desktop/src-tauri/tauri.conf.json').version")"
VERSION="${1:-$PACKAGE_VERSION}"

replace_line() {
  local file="$1"
  local pattern="$2"
  local replacement="$3"
  local tmp
  tmp="$(mktemp)"

  awk -v pattern="$pattern" -v replacement="$replacement" '
    $0 ~ pattern {
      print replacement
      next
    }
    { print }
  ' "$file" > "$tmp"

  mv "$tmp" "$file"
}

if [ "$PACKAGE_VERSION" != "$VERSION" ]; then
  echo "packages/openlinear/package.json version ($PACKAGE_VERSION) does not match requested version ($VERSION)." >&2
  exit 1
fi

if [ "$TAURI_VERSION" != "$VERSION" ]; then
  echo "apps/desktop/src-tauri/tauri.conf.json version ($TAURI_VERSION) does not match requested version ($VERSION)." >&2
  exit 1
fi

replace_line "$PKGBUILD" "^pkgver=" "pkgver=${VERSION}"
replace_line "$PKGBUILD" "^pkgrel=" "pkgrel=1"

cat > "$SRCINFO" <<EOF
pkgbase = openlinear-bin
	pkgdesc = AI-powered project management that actually writes the code — desktop app
	pkgver = ${VERSION}
	pkgrel = 1
	url = https://github.com/kaizen403/openlinear
	arch = x86_64
	license = MIT
	depends = glibc
	depends = gtk3
	depends = webkit2gtk-4.1
	optdepends = libappindicator-gtk3: system tray support
	optdepends = xdg-utils: open links in browser
	provides = openlinear
	conflicts = openlinear
	source = openlinear-${VERSION}-x86_64.AppImage::https://github.com/kaizen403/openlinear/releases/download/v${VERSION}/openlinear-${VERSION}-x86_64.AppImage
	source = openlinear.desktop
	source = openlinear.png::https://raw.githubusercontent.com/kaizen403/openlinear/v${VERSION}/apps/desktop/src-tauri/icons/icon.png
	sha256sums = SKIP
	sha256sums = SKIP
	sha256sums = SKIP

pkgname = openlinear-bin
EOF

echo "Updated Arch metadata for v${VERSION}"
