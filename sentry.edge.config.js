import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Only enable in production/staging
  enabled: process.env.NODE_ENV === "production",

  // Environment tag to distinguish staging vs production in Sentry dashboard
  environment: process.env.NEXT_PUBLIC_APP_ENV || "production",

  // Performance monitoring - sample 10% of transactions
  tracesSampleRate: 0.1,
});
