import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Only enable in production/staging
  enabled: process.env.NODE_ENV === "production",

  // Environment tag to distinguish staging vs production in Sentry dashboard
  environment: process.env.NEXT_PUBLIC_APP_ENV || "production",

  // Performance monitoring - sample 10% of transactions
  tracesSampleRate: 0.1,

  // Session replay - capture 5% of sessions, 100% of sessions with errors
  replaysSessionSampleRate: 0.05,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration(),
    Sentry.browserTracingIntegration(),
  ],

  // Filter out noisy errors
  ignoreErrors: [
    "ResizeObserver loop",
    "Network request failed",
    "Load failed",
    "AbortError",
    "ChunkLoadError",
  ],
});
