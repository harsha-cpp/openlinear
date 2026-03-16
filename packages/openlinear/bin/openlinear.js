#!/usr/bin/env node
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runGitHubAuthCommand } = require('./github-auth');

function findMacosBundleBinary() {
  const bundlePaths = [
    path.join(os.homedir(), 'Applications', 'OpenLinear.app'),
    '/Applications/OpenLinear.app',
    path.join(os.homedir(), '.openlinear', 'OpenLinear.app'),
  ];

  for (const bundlePath of bundlePaths) {
    const macosDir = path.join(bundlePath, 'Contents', 'MacOS');
    if (!fs.existsSync(macosDir)) {
      continue;
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
    if (primaryEntry) {
      return path.join(macosDir, primaryEntry.name);
    }
  }

  return null;
}

async function main() {
  const [firstArg, secondArg, ...restArgs] = process.argv.slice(2);

  if (firstArg === 'github') {
    await runGitHubAuthCommand(secondArg, restArgs);
    return;
  }

  if (firstArg === '--help' || firstArg === '-h') {
    console.log('Usage: openlinear [github <login|logout|whoami|status> [--browser|--device]]');
    console.log('');
    console.log('Without arguments, launches the local OpenLinear app if installed.');
    process.exit(0);
  }

  const binaryPaths = [
    path.join(os.homedir(), '.openlinear', 'openlinear-linux-x64', 'openlinear-desktop'),
    path.join(os.homedir(), '.openlinear', 'openlinear'),
    path.join(os.homedir(), '.openlinear', 'openlinear.AppImage'),
    findMacosBundleBinary(),
  ].filter(Boolean);

  const binaryPath = binaryPaths.find((p) => fs.existsSync(p));

  if (!binaryPath) {
    console.error('OpenLinear desktop app not found.');
    console.error('');
    console.error('Install it from npm:');
    console.error('  npm install -g openlinear');
    console.error('');
    console.error('Or download the latest desktop release:');
    console.error('  https://github.com/kaizen403/openlinear/releases/latest');
    process.exit(1);
  }

  const env = { ...process.env };

  if (process.platform === 'linux') {
    const isWayland =
      (process.env.XDG_SESSION_TYPE || '').toLowerCase() === 'wayland' ||
      !!process.env.WAYLAND_DISPLAY;

    env.WEBKIT_DISABLE_DMABUF_RENDERER = '1';

    if (isWayland && !process.env.LD_PRELOAD) {
      const waylandLibPaths = [
        '/usr/lib/libwayland-client.so',
        '/usr/lib64/libwayland-client.so',
        '/usr/lib/x86_64-linux-gnu/libwayland-client.so',
      ];
      const found = waylandLibPaths.find((p) => fs.existsSync(p));
      if (found) {
        env.LD_PRELOAD = found;
      } else {
        env.GDK_BACKEND = 'x11';
        env.WEBKIT_DISABLE_COMPOSITING_MODE = '1';
      }
    } else if (!isWayland) {
      env.WEBKIT_DISABLE_COMPOSITING_MODE = '1';
    }
  }

  if (binaryPath.endsWith('.AppImage')) {
    env.APPIMAGE_EXTRACT_AND_RUN = '1';
  }

  const child = spawn(binaryPath, process.argv.slice(2), {
    detached: true,
    stdio: 'ignore',
    env,
  });

  child.unref();

  process.exit(0);
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
