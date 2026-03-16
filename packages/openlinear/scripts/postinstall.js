const fs = require('node:fs');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const platform = process.platform;
const arch = process.arch;
const isGlobalInstall = process.env.npm_config_global === 'true' || process.env.npm_config_location === 'global';
const releasesUrl = 'https://github.com/kaizen403/openlinear/releases/latest';
const curlInstallCommand = 'curl -fsSL https://raw.githubusercontent.com/kaizen403/openlinear/main/install.sh | bash';

function failInstall(message) {
  console.error(`\n\x1b[31m✗\x1b[0m ${message}`);

  if (isGlobalInstall) {
    console.error(`\x1b[33m!\x1b[0m Try \`${curlInstallCommand}\` or download from ${releasesUrl}.`);
    process.exit(1);
  }

  console.warn('\x1b[33m!\x1b[0m Continuing because the package may be installed as a library dependency.');
  process.exit(0);
}

const installDir = path.join(os.homedir(), '.openlinear');
const appImagePath = path.join(installDir, 'openlinear.AppImage');
const dataDir = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
const localBinDir = path.join(os.homedir(), '.local', 'bin');
const localLauncherPath = path.join(localBinDir, 'openlinear');
const linuxDesktopDir = path.join(dataDir, 'applications');
const linuxDesktopPath = path.join(linuxDesktopDir, 'openlinear.desktop');
const linuxIconDir = path.join(dataDir, 'icons', 'hicolor', '256x256', 'apps');
const linuxIconPath = path.join(linuxIconDir, 'openlinear.png');
const macosApplicationsDir = path.join(os.homedir(), 'Applications');
const macosAppPath = path.join(macosApplicationsDir, 'OpenLinear.app');
const legacyMacosAppPath = path.join(installDir, 'OpenLinear.app');

function findAppBundle(rootDir) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory() && entry.name.endsWith('.app')) {
      return entryPath;
    }
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const nestedBundlePath = findAppBundle(path.join(rootDir, entry.name));
    if (nestedBundlePath) {
      return nestedBundlePath;
    }
  }

  return null;
}

function findMacosExecutable(appBundlePath) {
  const macosDir = path.join(appBundlePath, 'Contents', 'MacOS');
  if (!fs.existsSync(macosDir)) {
    return null;
  }

  const entries = fs.readdirSync(macosDir, { withFileTypes: true })
    .filter((entry) => entry.isFile());

  const preferredEntries = ['OpenLinear', 'openlinear-desktop'];
  for (const entryName of preferredEntries) {
    const match = entries.find((entry) => entry.name === entryName);
    if (match) {
      return path.join(macosDir, match.name);
    }
  }

  const primaryEntry = entries.find((entry) => !entry.name.includes('sidecar'));
  return primaryEntry ? path.join(macosDir, primaryEntry.name) : null;
}

function writeExecutableFile(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
  fs.chmodSync(filePath, 0o755);
}

function writeLinuxLauncherScript() {
  writeExecutableFile(localLauncherPath, `#!/usr/bin/env bash
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
  for lib in \\
    /usr/lib/libwayland-client.so \\
    /usr/lib64/libwayland-client.so \\
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
`);
}

function writeMacosLauncherScript() {
  writeExecutableFile(localLauncherPath, `#!/usr/bin/env bash
set -euo pipefail

APP_BUNDLE=""
for candidate in \\
  "\${HOME}/Applications/OpenLinear.app" \\
  "\${HOME}/.openlinear/OpenLinear.app" \\
  "/Applications/OpenLinear.app"; do
  if [ -d "$candidate" ]; then
    APP_BUNDLE="$candidate"
    break
  fi
done

if [ -z "$APP_BUNDLE" ]; then
  echo "OpenLinear macOS app not found in ~/Applications, ~/.openlinear, or /Applications" >&2
  echo "Reinstall with: curl -fsSL https://raw.githubusercontent.com/kaizen403/openlinear/main/install.sh | bash" >&2
  exit 1
fi

exec open -a "$APP_BUNDLE" --args "$@"
`);
}

function downloadToFile(url, destination) {
  return new Promise((resolve, reject) => {
    httpsGet(url).then((response) => {
      const fileStream = fs.createWriteStream(destination);
      response.pipe(fileStream);
      fileStream.on('finish', () => fileStream.close(resolve));
      fileStream.on('error', (err) => {
        fileStream.close();
        reject(err);
      });
    }).catch(reject);
  });
}

async function installLinuxDesktopIntegration(release) {
  const iconUrl = `https://raw.githubusercontent.com/kaizen403/openlinear/${release.tag_name}/apps/desktop/src-tauri/icons/icon.png`;
  let desktopIconValue = linuxIconPath;

  writeLinuxLauncherScript();
  fs.mkdirSync(linuxDesktopDir, { recursive: true });
  fs.mkdirSync(linuxIconDir, { recursive: true });

  try {
    await downloadToFile(iconUrl, linuxIconPath);
  } catch (error) {
    desktopIconValue = 'openlinear';
    console.warn(`\\x1b[33m!\\x1b[0m Failed to download desktop icon: ${error.message}`);
  }

  fs.writeFileSync(linuxDesktopPath, `[Desktop Entry]
Version=1.0
Name=OpenLinear
Comment=AI-powered project management that actually writes the code
Exec=${localLauncherPath} %U
Icon=${desktopIconValue}
Type=Application
Categories=Development;ProjectManagement;
MimeType=x-scheme-handler/openlinear;
StartupNotify=true
StartupWMClass=OpenLinear
Terminal=false
`);

  const refreshDesktopDatabase = spawnSync('update-desktop-database', [linuxDesktopDir], {
    stdio: 'ignore',
  });

  if (refreshDesktopDatabase.error && refreshDesktopDatabase.error.code !== 'ENOENT') {
    console.warn(`\\x1b[33m!\\x1b[0m Failed to refresh desktop database: ${refreshDesktopDatabase.error.message}`);
  }
}

function registerMacosApp() {
  const lsregisterPath = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';

  if (fs.existsSync(lsregisterPath)) {
    spawnSync(lsregisterPath, ['-f', macosAppPath], { stdio: 'ignore' });
  }

  try {
    fs.utimesSync(macosApplicationsDir, new Date(), new Date());
  } catch {}

  try {
    fs.utimesSync(macosAppPath, new Date(), new Date());
  } catch {}
}

function getPlatformTarget() {
  if (platform === 'linux' && arch === 'x64') {
    return {
      assetName: 'Linux AppImage',
      assetMatcher: (asset) => asset.name.endsWith('-x86_64.AppImage'),
      install: async (downloadPath, release) => {
        if (fs.existsSync(appImagePath)) {
          console.log('\x1b[36m==>\x1b[0m Removing old AppImage...');
          fs.unlinkSync(appImagePath);
        }

        fs.copyFileSync(downloadPath, appImagePath);
        fs.chmodSync(appImagePath, 0o755);
        await installLinuxDesktopIntegration(release);

        console.log(`\x1b[32m✓\x1b[0m OpenLinear ${release.tag_name} installed to ${appImagePath}`);
      },
    };
  }

  if (platform === 'darwin' && (arch === 'x64' || arch === 'arm64')) {
    const suffix = arch === 'arm64' ? '-aarch64.app.tar.gz' : '-x86_64.app.tar.gz';

    return {
      assetName: 'macOS app bundle',
      assetMatcher: (asset) => asset.name.endsWith(suffix),
      install: (downloadPath, release) => {
        const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openlinear-app-'));
        const untar = spawnSync('tar', ['-xzf', downloadPath, '-C', extractDir], {
          encoding: 'utf8',
        });

        if (untar.status !== 0) {
          const message = untar.stderr?.trim() || untar.stdout?.trim() || 'tar failed';
          failInstall(`Failed to extract OpenLinear.app: ${message}`);
        }

        const appBundlePath = findAppBundle(extractDir);
        if (!appBundlePath) {
          failInstall('Failed to locate OpenLinear.app in the downloaded archive.');
        }

        fs.mkdirSync(macosApplicationsDir, { recursive: true });
        fs.rmSync(macosAppPath, { recursive: true, force: true });
        fs.rmSync(legacyMacosAppPath, { recursive: true, force: true });
        fs.cpSync(appBundlePath, macosAppPath, { recursive: true });

        const executablePath = findMacosExecutable(macosAppPath);
        if (!executablePath) {
          failInstall('Failed to locate the OpenLinear macOS executable inside the app bundle.');
        }

        fs.chmodSync(executablePath, 0o755);
        try {
          fs.symlinkSync(macosAppPath, legacyMacosAppPath, 'dir');
        } catch {}
        writeMacosLauncherScript();
        registerMacosApp();
        fs.rmSync(extractDir, { recursive: true, force: true });

        console.log(`\x1b[32m✓\x1b[0m OpenLinear ${release.tag_name} installed to ${macosAppPath}`);
      },
    };
  }

  failInstall('OpenLinear desktop launcher currently supports macOS (Apple Silicon / Intel) and Linux x64 only.');
}

const platformTarget = getPlatformTarget();

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'openlinear-installer' } }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        httpsGet(response.headers.location).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode} from ${url}`));
        return;
      }
      resolve(response);
    }).on('error', reject);
  });
}

function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    httpsGet(url).then((response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Invalid JSON from ${url}`)); }
      });
    }).catch(reject);
  });
}

function downloadFile(url, destination, expectedSize) {
  return new Promise((resolve, reject) => {
    httpsGet(url).then((response) => {
      const totalBytes = parseInt(response.headers['content-length'], 10) || expectedSize;
      let downloadedBytes = 0;
      let lastPrintedPercentage = -1;

      console.log(`\x1b[36m==>\x1b[0m Downloading OpenLinear ${platformTarget.assetName} (~${(totalBytes / 1024 / 1024).toFixed(1)} MB)...`);

      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        if (!isNaN(totalBytes) && totalBytes > 0) {
          const percentage = Math.floor((downloadedBytes / totalBytes) * 100);
          if (percentage % 10 === 0 && percentage !== lastPrintedPercentage) {
            process.stdout.write(`\r\x1b[36m==>\x1b[0m Progress: ${percentage}%`);
            lastPrintedPercentage = percentage;
          }
        }
      });

      const fileStream = fs.createWriteStream(destination);
      response.pipe(fileStream);
      fileStream.on('finish', () => {
        process.stdout.write(`\r\x1b[36m==>\x1b[0m Progress: 100%\n`);
        fileStream.close(() => {
          const stat = fs.statSync(destination);
          if (expectedSize && stat.size !== expectedSize) {
            fs.unlinkSync(destination);
            reject(new Error(`Download incomplete: got ${stat.size} bytes, expected ${expectedSize}`));
            return;
          }
          resolve();
        });
      });
      fileStream.on('error', (err) => {
        fileStream.close();
        reject(err);
      });
    }).catch(reject);
  });
}

async function main() {
  try {
    const releaseUrl = process.env.OPENLINEAR_RELEASE_API_URL ||
      'https://api.github.com/repos/kaizen403/openlinear/releases/latest';

    console.log('\x1b[36m==>\x1b[0m Fetching latest OpenLinear release...');
    const release = await httpsGetJson(releaseUrl);

    const asset = release.assets.find(platformTarget.assetMatcher);
    if (!asset) {
      failInstall(`No ${platformTarget.assetName} found in the latest release.`);
    }

    console.log(`\x1b[36m==>\x1b[0m Found ${asset.name} (${release.tag_name})`);

    fs.mkdirSync(installDir, { recursive: true });

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openlinear-download-'));
    const downloadPath = path.join(tempDir, asset.name);

    await downloadFile(asset.browser_download_url, downloadPath, asset.size);
    await platformTarget.install(downloadPath, release);
    fs.rmSync(tempDir, { recursive: true, force: true });

    console.log(`\x1b[32m✓\x1b[0m You can now run \x1b[1mopenlinear\x1b[0m in your terminal.`);
  } catch (error) {
    failInstall(`Failed to install OpenLinear: ${error.message}`);
  }
}

main();
