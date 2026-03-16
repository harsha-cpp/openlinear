#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { constants as fsConstants, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function resolveBinaryPath() {
  if (process.platform === "linux") {
    if (process.arch === "x64") {
      return path.join(
        ROOT_DIR,
        "apps/desktop/src-tauri/binaries/openlinear-sidecar-x86_64-unknown-linux-gnu",
      );
    }

    if (process.arch === "arm64") {
      return path.join(
        ROOT_DIR,
        "apps/desktop/src-tauri/binaries/openlinear-sidecar-aarch64-unknown-linux-gnu",
      );
    }
  }

  if (process.platform === "darwin") {
    if (process.arch === "x64") {
      return path.join(
        ROOT_DIR,
        "apps/desktop/src-tauri/binaries/openlinear-sidecar-x86_64-apple-darwin",
      );
    }

    if (process.arch === "arm64") {
      return path.join(
        ROOT_DIR,
        "apps/desktop/src-tauri/binaries/openlinear-sidecar-aarch64-apple-darwin",
      );
    }
  }

  throw new Error(`Unsupported smoke test platform: ${process.platform}/${process.arch}`);
}

function shellQuote(value) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function main() {
  const binaryPath = resolveBinaryPath();
  await access(binaryPath, fsConstants.X_OK);

  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "openlinear-sidecar-smoke-"));
  const logPath = path.join(tmpDir, "sidecar.log");

  try {
    const command = [
      `timeout 15s ${shellQuote(binaryPath)} > ${shellQuote(logPath)} 2>&1 || true`,
      `cat ${shellQuote(logPath)}`,
      `grep -q 'Server running on http://localhost:3001' ${shellQuote(logPath)}`,
    ].join("; ");

    const result = spawnSync("bash", ["-lc", command], {
      cwd: ROOT_DIR,
      env: { ...process.env },
      encoding: "utf8",
    });

    if (result.stdout) {
      process.stdout.write(result.stdout);
    }

    if (result.stderr) {
      process.stderr.write(result.stderr);
    }

    if (result.status !== 0) {
      const logOutput = readFileSync(logPath, "utf8");
      throw new Error(
        `Sidecar smoke test failed before readiness. Exit code: ${result.status}\n${logOutput}`,
      );
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
