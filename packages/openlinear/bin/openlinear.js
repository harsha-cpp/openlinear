```#!/usr/bin/env node
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const binaryPaths = [
  path.join(os.homedir(), '.openlinear', 'openlinear'),
  path.join(os.homedir(), '.openlinear', 'openlinear.AppImage'),
];

const binaryPath = binaryPaths.find((p) => fs.existsSync(p));

if (!binaryPath) {
  console.error('OpenLinear desktop app not found.');
  console.error('');
  console.error('Please install it:');
  console.error('  curl -fsSL https://rixie.in/api/install | bash');
  console.error('');
  console.error('Or build from source:');
  console.error('  git clone https://github.com/kaizen403/openlinear.git');
  console.error('  cd openlinear && pnpm install && pnpm --filter @openlinear/desktop build');
  process.exit(1);
}

const isWayland =
  (process.env.XDG_SESSION_TYPE || '').toLowerCase() === 'wayland' ||
  !!process.env.WAYLAND_DISPLAY;

const env = {
  ...process.env,
  WEBKIT_DISABLE_DMABUF_RENDERER: '1',
};

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

if (binaryPath.endsWith('.AppImage')) {
  env.APPIMAGE_EXTRACT_AND_RUN = '1';
}

// Launch detached from the terminal/session so the app survives Ctrl+C and shell exit.
const child = spawn(binaryPath, process.argv.slice(2), {
  detached: true,
  stdio: 'ignore',
  env,
});

// Allow parent CLI to exit immediately while child keeps running.
child.unref();

// Exit successfully once launch is handed off.
process.exit(0);
