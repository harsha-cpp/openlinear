const fs = require('fs');
const path = require('path');

const BUMP_TYPES = ['patch', 'minor', 'major'];
const arg = process.argv[2];

if (!arg) {
  console.error('Usage: node bump-version.js <patch|minor|major|x.y.z>');
  process.exit(1);
}

const tauriConfPath = path.join(__dirname, '../apps/desktop/src-tauri/tauri.conf.json');
const pkgJsonPath = path.join(__dirname, '../packages/openlinear/package.json');

const currentVersion = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8')).version;
const [major, minor, patch] = currentVersion.split('.').map(Number);

let targetVersion;
if (BUMP_TYPES.includes(arg)) {
  if (arg === 'major') targetVersion = `${major + 1}.0.0`;
  else if (arg === 'minor') targetVersion = `${major}.${minor + 1}.0`;
  else targetVersion = `${major}.${minor}.${patch + 1}`;
} else if (/^\d+\.\d+\.\d+$/.test(arg)) {
  targetVersion = arg;
} else {
  console.error(`Invalid argument: "${arg}". Use patch, minor, major, or x.y.z`);
  process.exit(1);
}

console.log(`${currentVersion} → ${targetVersion}`);

const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
tauriConf.version = targetVersion;
fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n');

const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
pkgJson.version = targetVersion;
fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n');

const pkgbuildPath = path.join(__dirname, '../packaging/aur/openlinear-bin/PKGBUILD');
let pkgbuild = fs.readFileSync(pkgbuildPath, 'utf8');
pkgbuild = pkgbuild.replace(/^pkgver=.*$/m, `pkgver=${targetVersion}`);
fs.writeFileSync(pkgbuildPath, pkgbuild);

const srcinfoPath = path.join(__dirname, '../packaging/aur/openlinear-bin/.SRCINFO');
let srcinfo = fs.readFileSync(srcinfoPath, 'utf8');
const oldVersion = currentVersion.replace(/\./g, '\\.');
srcinfo = srcinfo.replace(/pkgver = .*$/gm, `pkgver = ${targetVersion}`);
srcinfo = srcinfo.replace(new RegExp(`v${oldVersion}`, 'g'), `v${targetVersion}`);
srcinfo = srcinfo.replace(new RegExp(`openlinear-${oldVersion}`, 'g'), `openlinear-${targetVersion}`);
fs.writeFileSync(srcinfoPath, srcinfo);

console.log(`Bumped: tauri.conf.json, package.json, PKGBUILD, .SRCINFO`);
