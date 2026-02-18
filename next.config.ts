import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {};

export default withSentryConfig(nextConfig, {
  // Replace with your Sentry org and project slugs
  org: process.env.SENTRY_ORG || "your-org",
  project: process.env.SENTRY_PROJECT || "form-tracker",

  silent: !process.env.CI,

  // Route browser events through your server to avoid ad blockers
  tunnelRoute: "/monitoring",

  // Upload source maps for readable stack traces
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
});
