import * as Sentry from "@sentry/nextjs";

import { scrubEvent } from "./lib/observability/scrubber";
import { tracesSampler } from "./lib/observability/sampler";

if (process.env.NODE_ENV !== "development") {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    // VERCEL_ENV isn't inlined client-side; falls back to NODE_ENV ('production').
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    sendDefaultPii: true,
    tracesSampler,
    // replaysSessionSampleRate: 0 — protect the free-plan 50 replays/mo quota.
    // replaysOnErrorSampleRate: 1.0 still buffers + uploads a replay on errors.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    enableLogs: true,
    beforeSend: scrubEvent,
    integrations: [
      Sentry.replayIntegration(),
    ],
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
