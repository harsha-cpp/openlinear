/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: process.env.NEXT_IGNORE_BUILD_ERRORS === "1",
  },
  experimental: {
    cpus: process.env.CI ? 1 : undefined,
  },
  output: 'export',
  images: {
    unoptimized: true,
  },
}

module.exports = nextConfig
