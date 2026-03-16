#!/usr/bin/env node

import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
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

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const binaryPath = resolveBinaryPath();
  await access(binaryPath, fsConstants.X_OK);

  const child = spawn(binaryPath, [], {
    cwd: ROOT_DIR,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  let ready = false;
  let exitCode = null;
  let spawnError = null;

  const appendOutput = (chunk) => {
    const text = chunk.toString();
    output += text;
    process.stdout.write(text);

    if (output.includes("Server running on http://localhost:3001")) {
      ready = true;
    }
  };

  child.stdout.on("data", appendOutput);
  child.stderr.on("data", appendOutput);

  child.on("exit", (code) => {
    exitCode = code;
  });

  child.on("error", (error) => {
    spawnError = error;
  });

  const deadline = Date.now() + 15000;
  while (!ready && exitCode === null && !spawnError && Date.now() < deadline) {
    await wait(200);
  }

  if (!ready) {
    if (exitCode === null) {
      child.kill("SIGTERM");
      await wait(500);
    }

    if (spawnError) {
      throw spawnError;
    }

    throw new Error(
      `Sidecar smoke test failed before readiness. Exit code: ${exitCode ?? "still running"}\n${output}`,
    );
  }

  child.kill("SIGTERM");
  await wait(1000);
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
