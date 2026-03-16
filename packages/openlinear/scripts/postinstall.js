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
const macosAppPath = path.join(installDir, 'OpenLinear.app');

function getPlatformTarget() {
  if (platform === 'linux' && arch === 'x64') {
    return {
      assetName: 'Linux AppImage',
      assetMatcher: (asset) => asset.name.endsWith('-x86_64.AppImage'),
      install: (downloadPath, release) => {
        if (fs.existsSync(appImagePath)) {
          console.log('\x1b[36m==>\x1b[0m Removing old AppImage...');
          fs.unlinkSync(appImagePath);
        }

        fs.copyFileSync(downloadPath, appImagePath);
        fs.chmodSync(appImagePath, 0o755);

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

        const appBundleName = fs.readdirSync(extractDir).find((entry) => entry.endsWith('.app'));
        if (!appBundleName) {
          failInstall('Failed to locate OpenLinear.app in the downloaded archive.');
        }

        fs.rmSync(macosAppPath, { recursive: true, force: true });
        fs.cpSync(path.join(extractDir, appBundleName), macosAppPath, { recursive: true });
        fs.rmSync(extractDir, { recursive: true, force: true });

        const executablePath = path.join(macosAppPath, 'Contents', 'MacOS', 'OpenLinear');
        fs.chmodSync(executablePath, 0o755);

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
    platformTarget.install(downloadPath, release);
    fs.rmSync(tempDir, { recursive: true, force: true });

    console.log(`\x1b[32m✓\x1b[0m You can now run \x1b[1mopenlinear\x1b[0m in your terminal.`);
  } catch (error) {
    failInstall(`Failed to install OpenLinear: ${error.message}`);
  }
}

main();
