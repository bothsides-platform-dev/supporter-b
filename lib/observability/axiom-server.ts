// Server-side Axiom logger for browser web-vitals relayed through `POST /api/axiom`
// (components/shell/WebVitals.tsx → app/api/axiom/route.ts). Operational logs stay on
// pino (lib/observability/logger.ts); this logger only forwards already-shaped events.
// `server-only` turns an accidental client import into a build error — this module
// reads the Axiom ingest token, which must never reach a browser bundle.
import 'server-only';
import { Axiom } from '@axiomhq/js';
import { AxiomJSTransport, Logger } from '@axiomhq/logging';

import { defineSingleton } from '@/lib/server/_singleton';

type Env = Record<string, string | undefined>;

export type AxiomWebVitalsTarget = { token: string; dataset: string };

// The relay is an unauthenticated public endpoint, so it only runs with the
// web-vitals-specific pair — the same NEXT_PUBLIC_AXIOM_* pair next-axiom's browser
// sender needed, so events land in the dataset they always did. There is deliberately
// no fallback to AXIOM_*: that is the pino operational-log dataset, and falling back
// would let anonymous callers write records into it.
//
// Read through the `env` parameter, not literal `process.env.NEXT_PUBLIC_*`: Next inlines
// the literal form at build time, and these values are meant to change with a restart
// (docs/DEPLOY_LIGHTSAIL.md).
export function resolveAxiomWebVitalsTarget(env: Env = process.env): AxiomWebVitalsTarget | null {
  const token = env.NEXT_PUBLIC_AXIOM_TOKEN;
  const dataset = env.NEXT_PUBLIC_AXIOM_DATASET;
  return token && dataset ? { token, dataset } : null;
}

/** `null` when Axiom is not configured (local dev) — callers drop events silently. */
export const {
  get: getAxiomWebVitalsLogger,
  set: __setAxiomWebVitalsLoggerForTest,
  reset: __resetAxiomWebVitalsLoggerForTest,
} = defineSingleton<Logger | null>('axiom_web_vitals_logger', 'infra', () => {
  const target = resolveAxiomWebVitalsTarget();
  return target
    ? new Logger({
        transports: [
          new AxiomJSTransport({ axiom: new Axiom({ token: target.token }), dataset: target.dataset }),
        ],
      })
    : null;
});
