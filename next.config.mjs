import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ✅ Allow cross-origin requests from development origins (e.g., zrok tunnels)
  allowedDevOrigins: [
    'epxs03af8o1a.share.zrok.io',
    '*.share.zrok.io', // Allow all zrok subdomains
    'localhost',
    '127.0.0.1',
    'https://backendload-stage.omniaiflow.com',
    'https://backend-stageomni.omniaiflow.com',
    'https://pre-prod-backendomni.omniaiflow.com',
    'https://app.omniaiflow.com'
  ],
  // ✅ Remove console.log in production (keep error and warn)
  // compiler: {
  //   removeConsole: process.env.NODE_ENV === 'production'
  //     ? { exclude: ['error', 'warn'] }
  //     : false,
  // },
  // ✅ Exclude ffmpeg packages from bundling (they use native binaries/dynamic requires)
  serverExternalPackages: ['fluent-ffmpeg', '@ffmpeg-installer/ffmpeg'],
  // ✅ Increase body size limit for large file uploads (500MB)
  experimental: {
    serverActions: {
      bodySizeLimit: '500mb',
    },
  },
};

export default withSentryConfig(nextConfig, {
  // Suppress source map upload logs during build
  silent: true,

  // Upload source maps for better stack traces
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,

  // Hide source maps from users
  hideSourceMaps: true,
});
