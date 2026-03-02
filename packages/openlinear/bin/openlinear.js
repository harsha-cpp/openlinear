#!/usr/bin/env node
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const appImagePath = path.join(os.homedir(), '.openlinear', 'openlinear.AppImage');

if (!fs.existsSync(appImagePath)) {
  console.error('OpenLinear AppImage not found.');
  console.error('Run: npm install -g @kaizen403/openlinear to download it.');
  process.exit(1);
}

const isWayland =
  (process.env.XDG_SESSION_TYPE || '').toLowerCase() === 'wayland' ||
  !!process.env.WAYLAND_DISPLAY;

const env = {
  ...process.env,
  APPIMAGE_EXTRACT_AND_RUN: '1',
  WEBKIT_DISABLE_DMABUF_RENDERER: '1',
};

// On Wayland: preload system libwayland-client to avoid EGL_BAD_PARAMETER crash
// caused by the AppImage's bundled libwayland-client conflicting with system EGL
if (isWayland && !process.env.LD_PRELOAD) {
  const waylandLibPaths = [
    '/usr/lib/libwayland-client.so',                    // Arch, Fedora
    '/usr/lib64/libwayland-client.so',                  // Fedora 64-bit
    '/usr/lib/x86_64-linux-gnu/libwayland-client.so',   // Debian/Ubuntu
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

const child = spawn(appImagePath, process.argv.slice(2), {
  stdio: 'inherit',
  env,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
