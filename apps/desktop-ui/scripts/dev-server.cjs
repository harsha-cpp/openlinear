#!/usr/bin/env node

const { spawn } = require("node:child_process")

const lowResourceProfile =
  process.env.OPENLINEAR_DEV_PROFILE === "low" ||
  process.env.OPENLINEAR_DEV_PROFILE === "constrained" ||
  process.env.OPENLINEAR_NEXT_DEV_ENGINE === "webpack"

const nextBin = require.resolve("next/dist/bin/next")
const args = [nextBin, "dev", ...process.argv.slice(2)]

if (lowResourceProfile) {
  args.push("--webpack")
}

const child = spawn(process.execPath, args, {
  stdio: "inherit",
  env: process.env,
})

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})
