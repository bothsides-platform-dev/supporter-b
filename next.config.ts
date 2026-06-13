import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { withAxiom } from "next-axiom";
import { SECURITY_HEADERS } from "./lib/security-headers";

// Dev: pipe stdout through pino-pretty: `pnpm dev 2>&1 | pnpm exec pino-pretty`
const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
  // Prevent pino (and its worker-thread transport) from being bundled for Edge.
  serverExternalPackages: ["pino", "pino-pretty", "@axiomhq/pino"],
  // Allow lvh.me (wildcard DNS → 127.0.0.1) as a trusted dev origin so local
  // cross-subdomain dev (buyer=lvh.me:3000, pg=partner.lvh.me:3000) works with
  // Next.js's CSRF-style origin check on cross-origin Server Action requests.
  allowedDevOrigins: ["lvh.me", "*.lvh.me"],
  // Next 16 acquires a `<distDir>/dev/lock` per `next dev` and refuses a second
  // dev server in the same dir *even on a different port*. The e2e webServer
  // (playwright.config.ts) starts `next dev --port 3001`; without an isolated
  // distDir it collides with a developer's local `pnpm dev` on :3000 and fails
  // to boot ("Another next dev server is already running"). NEXT_DIST_DIR lets
  // the e2e server build into `.next-e2e`, giving it its own lock + build cache.
  // Unset → default `.next`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default withSentryConfig(withAxiom(nextConfig), {
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
