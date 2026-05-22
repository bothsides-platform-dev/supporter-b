import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Axiom: Vercel Dashboard → Integrations → Axiom → "Connect" your project.
// Axiom's Log Drain captures all stdout automatically — no SDK needed.
// Dev: pipe stdout through pino-pretty: `pnpm dev 2>&1 | pnpm exec pino-pretty`
const nextConfig: NextConfig = {
  // Prevent pino (and its worker-thread transport) from being bundled for Edge.
  serverExternalPackages: ["pino", "pino-pretty"],
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  silent: !process.env.CI,
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
  },
});
