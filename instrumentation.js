export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = async (err, request, context) => {
  const { default: Sentry } = await import("@sentry/nextjs");
  Sentry.captureRequestError(err, request, context);
};
