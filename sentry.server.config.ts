import * as Sentry from "@sentry/nextjs";

import { scrubEvent } from "./lib/observability/scrubber";
import { tracesSampler } from "./lib/observability/sampler";

if (process.env.NODE_ENV !== "development") {
  Sentry.init({
    dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    sendDefaultPii: true,
    // includeLocalVariables removed: server stack frames could carry
    // 사업자번호/계좌/카드수수료 to the US region. beforeSend scrubs the rest.
    tracesSampler,
    enableLogs: true,
    beforeSend: scrubEvent,
  });
}
