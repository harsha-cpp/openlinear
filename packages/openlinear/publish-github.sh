#!/usr/bin/env bash
set -euo pipefail

# Usage: GITHUB_TOKEN=<your-pat> bash publish-github.sh
# Token needs: write:packages + read:packages scopes
# Create one at: https://github.com/settings/tokens/new

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "Error: GITHUB_TOKEN is not set"
  echo "Usage: GITHUB_TOKEN=<your-pat> bash publish-github.sh"
  echo "Create a token at: https://github.com/settings/tokens/new"
  echo "Required scopes: write:packages, read:packages"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

npm run build

NPMRC_FILE=".npmrc.github"
cat > "$NPMRC_FILE" << EOF
@openlinear:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
EOF

ORIG_NAME=$(node -p "require('./package.json').name")
ORIG_PUBLISH_CONFIG=$(node -p "JSON.stringify(require('./package.json').publishConfig || {})")

node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.name = '@openlinear/openlinear';
pkg.publishConfig = { registry: 'https://npm.pkg.github.com', access: 'public' };
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

npm publish --userconfig "$NPMRC_FILE"

node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.name = '$ORIG_NAME';
pkg.publishConfig = $ORIG_PUBLISH_CONFIG;
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

rm -f "$NPMRC_FILE"

echo ""
echo "Done! https://github.com/openlinear?tab=packages"
