// Server-side Axiom logger for browser web-vitals relayed through `POST /api/axiom`
// (components/shell/WebVitals.tsx → app/api/axiom/route.ts). Operational logs stay on
// pino (lib/observability/logger.ts); this logger only forwards already-shaped events.
// `server-only` turns an accidental client import into a build error — this module
// reads the Axiom ingest token, which must never reach a browser bundle.
import 'server-only';
import { Axiom } from '@axiomhq/js';
import { AxiomJSTransport, Logger } from '@axiomhq/logging';

type Env = Record<string, string | undefined>;

export type AxiomWebVitalsTarget = { token: string; dataset: string };

// Same precedence next-axiom used (NEXT_PUBLIC_* first, then AXIOM_*, per field) so
// web-vitals keep landing in the dataset they used before the SDK migration. Reading
// AXIOM_* first would silently move them into the pino operational-log dataset.
export function resolveAxiomWebVitalsTarget(env: Env = process.env): AxiomWebVitalsTarget | null {
  const token = env.NEXT_PUBLIC_AXIOM_TOKEN || env.AXIOM_TOKEN;
  const dataset = env.NEXT_PUBLIC_AXIOM_DATASET || env.AXIOM_DATASET;
  return token && dataset ? { token, dataset } : null;
}

let cached: Logger | null | undefined;

/** `null` when Axiom is not configured (local dev) — callers drop events silently. */
export function getAxiomWebVitalsLogger(): Logger | null {
  if (cached !== undefined) return cached;
  const target = resolveAxiomWebVitalsTarget();
  cached = target
    ? new Logger({
        transports: [
          new AxiomJSTransport({ axiom: new Axiom({ token: target.token }), dataset: target.dataset }),
        ],
      })
    : null;
  return cached;
}
