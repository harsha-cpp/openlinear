#!/usr/bin/env node
/**
 * Generate brand raster assets from the canonical SVG logomark/wordmark.
 * Outputs:
 *   - apps/desktop-ui/public/{favicon.ico, icon-192.png, icon-512.png, apple-touch-icon.png, og-image.png, twitter-card.png}
 *   - apps/landing/public/{favicon.ico, apple-touch-icon.png, og-image.png}
 *   - apps/desktop/src-tauri/icons/{32x32.png, 128x128.png, 128x128@2x.png, icon.png}
 *   - .ico/.icns left for tauri CLI / png-to-ico
 */
const sharp = require('sharp')
const pngToIco = require('png-to-ico').default
const path = require('node:path')
const fs = require('node:fs/promises')

const ROOT = path.resolve(__dirname, '..')
const ACCENT = '#1d4ed8' // OpenLinear canonical brand blue
const BG = '#0a0a0a'     // dark canvas
const FG_DARK = '#ffffff'

// Logomark used for app icons — accent on dark, square w/ generous padding so the mark reads at small sizes.
const APP_ICON_SVG = (size) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="${BG}"/>
  <circle cx="32" cy="32" r="20" stroke="${ACCENT}" stroke-width="7" fill="none"/>
  <path d="M23 41 L41 23" stroke="${ACCENT}" stroke-width="7" stroke-linecap="square"/>
</svg>`

// Favicon variant: high-contrast, no rounded corners (browser chrome handles cropping)
const FAVICON_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="${BG}"/>
  <circle cx="32" cy="32" r="20" stroke="${ACCENT}" stroke-width="8" fill="none"/>
  <path d="M23 41 L41 23" stroke="${ACCENT}" stroke-width="8" stroke-linecap="square"/>
</svg>`

// OG / Twitter card: 1200x630, dark editorial layout
const OG_SVG = (w = 1200, h = 630, title = 'OpenLinear', tagline = 'AI-powered project management that actually writes the code.') => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0a0a0a"/>
      <stop offset="100%" stop-color="#111827"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.85" cy="0.15" r="0.7">
      <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  <rect width="${w}" height="${h}" fill="url(#glow)"/>
  <!-- subtle grid -->
  <g stroke="#ffffff" stroke-opacity="0.04" stroke-width="1">
    ${Array.from({ length: 12 }, (_, i) => `<line x1="${i * 100}" y1="0" x2="${i * 100}" y2="${h}"/>`).join('')}
    ${Array.from({ length: 7 }, (_, i) => `<line x1="0" y1="${i * 100}" x2="${w}" y2="${i * 100}"/>`).join('')}
  </g>
  <!-- Logomark -->
  <g transform="translate(96, 96)">
    <circle cx="40" cy="40" r="32" stroke="${FG_DARK}" stroke-width="10" fill="none"/>
    <path d="M26 54 L54 26" stroke="${FG_DARK}" stroke-width="10" stroke-linecap="square"/>
  </g>
  <!-- Wordmark + tagline -->
  <text x="96" y="430"
        font-family="'Space Grotesk', 'Inter', system-ui, sans-serif"
        font-size="120" font-weight="600" letter-spacing="-4"
        fill="${FG_DARK}">${title}</text>
  <text x="96" y="500"
        font-family="'DM Sans', 'Inter', system-ui, sans-serif"
        font-size="32" font-weight="400" letter-spacing="-0.4"
        fill="#cbd5e1">${tagline}</text>
  <!-- Accent rule -->
  <rect x="96" y="540" width="120" height="6" fill="${ACCENT}"/>
  <text x="96" y="585"
        font-family="'DM Mono', ui-monospace, monospace"
        font-size="22" font-weight="500" letter-spacing="2"
        fill="#94a3b8">openlinear.tech</text>
</svg>`

async function svgToPng(svg, size) {
  return sharp(Buffer.from(svg)).resize(size, size, { fit: 'contain' }).png().toBuffer()
}

async function svgToPngWH(svg, w, h) {
  return sharp(Buffer.from(svg)).resize(w, h, { fit: 'contain' }).png().toBuffer()
}

async function writeFile(p, buf) {
  await fs.mkdir(path.dirname(p), { recursive: true })
  await fs.writeFile(p, buf)
  console.log('  ✓', path.relative(ROOT, p), `(${(buf.length / 1024).toFixed(1)}kb)`)
}

async function main() {
  console.log('Generating OpenLinear brand assets...\n')

  const desktopUi = path.join(ROOT, 'apps/desktop-ui/public')
  const landing = path.join(ROOT, 'apps/landing/public')
  const tauriIcons = path.join(ROOT, 'apps/desktop/src-tauri/icons')

  // --- App icons (PNG) ---
  console.log('App icons:')
  const icon192 = await svgToPng(APP_ICON_SVG(192), 192)
  const icon512 = await svgToPng(APP_ICON_SVG(512), 512)
  const apple = await svgToPng(APP_ICON_SVG(180), 180)
  await writeFile(path.join(desktopUi, 'icon-192.png'), icon192)
  await writeFile(path.join(desktopUi, 'icon-512.png'), icon512)
  await writeFile(path.join(desktopUi, 'apple-touch-icon.png'), apple)
  await writeFile(path.join(landing, 'apple-touch-icon.png'), apple)

  // --- Favicons (multi-size ICO) ---
  console.log('\nFavicons:')
  const fav16 = await svgToPng(FAVICON_SVG, 16)
  const fav32 = await svgToPng(FAVICON_SVG, 32)
  const fav48 = await svgToPng(FAVICON_SVG, 48)
  const ico = await pngToIco([fav16, fav32, fav48])
  await writeFile(path.join(desktopUi, 'favicon.ico'), ico)
  await writeFile(path.join(landing, 'favicon.ico'), ico)
  // Also drop a favicon-32 for some browsers
  await writeFile(path.join(desktopUi, 'favicon-32.png'), fav32)
  await writeFile(path.join(landing, 'favicon-32.png'), fav32)

  // --- OG + Twitter cards ---
  console.log('\nOG / Twitter cards:')
  const og = await svgToPngWH(OG_SVG(1200, 630), 1200, 630)
  const twitter = await svgToPngWH(
    OG_SVG(1200, 600, 'OpenLinear', 'Drag tasks. Click execute. Get a pull request.'),
    1200, 600
  )
  await writeFile(path.join(desktopUi, 'og-image.png'), og)
  await writeFile(path.join(desktopUi, 'twitter-card.png'), twitter)
  await writeFile(path.join(landing, 'og-image.png'), og)

  // --- Tauri PNG set (icns/ico still need `tauri icon` for proper format) ---
  console.log('\nTauri icons (PNG subset — run `tauri icon` for icns/ico):')
  const tauri32 = await svgToPng(APP_ICON_SVG(32), 32)
  const tauri128 = await svgToPng(APP_ICON_SVG(128), 128)
  const tauri256 = await svgToPng(APP_ICON_SVG(256), 256)
  const tauri512 = await svgToPng(APP_ICON_SVG(512), 512)
  await writeFile(path.join(tauriIcons, '32x32.png'), tauri32)
  await writeFile(path.join(tauriIcons, '128x128.png'), tauri128)
  await writeFile(path.join(tauriIcons, '128x128@2x.png'), tauri256)
  await writeFile(path.join(tauriIcons, 'icon.png'), tauri512)

  console.log('\n✓ Brand asset generation complete.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
