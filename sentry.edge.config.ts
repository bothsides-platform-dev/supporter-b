import * as Sentry from "@sentry/nextjs";

import { scrubEvent } from "./lib/observability/scrubber";
import { tracesSampler } from "./lib/observability/sampler";

if (process.env.NODE_ENV !== "development") {
  Sentry.init({
    dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    sendDefaultPii: true,
    tracesSampler,
    enableLogs: true,
    beforeSend: scrubEvent,
  });
}
