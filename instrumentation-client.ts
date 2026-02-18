import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  sendDefaultPii: true,

  // Sample 100% in dev, 100% in production — adjust down for high-traffic apps
  tracesSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration({
      maskAllText: false,
      maskAllInputs: true,
      blockAllMedia: false,
    }),
    Sentry.feedbackIntegration({ colorScheme: "system" }),
  ],

  // Replay 100% of sessions in dev, 10% in production; always capture on error
  replaysSessionSampleRate:
    process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  replaysOnErrorSampleRate: 1.0,

  enableLogs: true,

  initialScope: {
    tags: { app: "form-tracker" },
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
