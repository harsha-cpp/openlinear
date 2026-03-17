/** @type {import('next').NextConfig} */
const { resolve } = require('path');

function parsePositiveInt(value) {
  if (!value) return undefined;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

const lowResourceProfile = process.env.OPENLINEAR_DEV_PROFILE === 'low' || process.env.OPENLINEAR_DEV_PROFILE === 'constrained';
const configuredCpus = parsePositiveInt(process.env.OPENLINEAR_NEXT_CPUS);

const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: process.env.NEXT_IGNORE_BUILD_ERRORS === "1",
  },
  outputFileTracingRoot: resolve(__dirname, '../..'),
  turbopack: {
    root: resolve(__dirname, '../..'),
  },
  experimental: {
    cpus: configuredCpus ?? (lowResourceProfile ? 1 : (process.env.CI ? 1 : undefined)),
  },
  output: 'export',
  images: {
    unoptimized: true,
  },
}

module.exports = nextConfig
