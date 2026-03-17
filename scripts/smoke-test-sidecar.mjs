#!/usr/bin/env node

import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const READINESS_LINE = "Server running on http://localhost:3001";
const STARTUP_TIMEOUT_MS = 15_000;

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

async function main() {
  const binaryPath = resolveBinaryPath();
  await access(binaryPath, fsConstants.X_OK);

  await new Promise((resolve, reject) => {
    const child = spawn(binaryPath, [], {
      cwd: ROOT_DIR,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let settled = false;
    let output = "";

    const settle = (callback) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeoutId);

      if (!child.killed) {
        child.kill("SIGTERM");
      }

      callback();
    };

    const onChunk = (chunk, writer) => {
      const text = chunk.toString();
      output += text;
      writer.write(text);

      if (output.includes(READINESS_LINE)) {
        settle(resolve);
      }
    };

    child.stdout?.on("data", (chunk) => onChunk(chunk, process.stdout));
    child.stderr?.on("data", (chunk) => onChunk(chunk, process.stderr));

    child.on("error", (error) => {
      settle(() => reject(error));
    });

    child.on("exit", (code, signal) => {
      if (settled) {
        return;
      }

      settle(() => {
        reject(
          new Error(
            `Sidecar smoke test failed before readiness. Exit code: ${code ?? "null"}, signal: ${signal ?? "null"}\n${output}`,
          ),
        );
      });
    });

    const timeoutId = setTimeout(() => {
      settle(() => {
        reject(
          new Error(
            `Sidecar smoke test timed out after ${STARTUP_TIMEOUT_MS}ms before readiness.\n${output}`,
          ),
        );
      });
    }, STARTUP_TIMEOUT_MS);
  });
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
