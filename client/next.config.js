/** @type {import('next').NextConfig} */
// `rewrites()` is resolved once, during `next build`, and its result is baked into
// the standalone build output — it is NOT re-read from the runtime container's
// environment. The Docker build stage sets API_INTERNAL_ORIGIN=http://api:4000
// before `npm run build` so the compose network hostname is what gets baked in.
// Plain `npm run dev` outside Docker falls back to localhost:4000.
const apiOrigin = process.env.API_INTERNAL_ORIGIN || 'http://localhost:4000';

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }];
  },
};

module.exports = nextConfig;
