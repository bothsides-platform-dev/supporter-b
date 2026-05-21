// Sentry `tracesSampler` — replaces a flat `tracesSampleRate: 0.1` so we can
// drop high-volume / low-value transactions and protect the free-plan spans
// quota. PURE module (no @sentry imports) — imported by the three init files.
//
//   - `/monitoring`               : the Sentry tunnel route (self-traffic)
//   - `/api/notifications/stream`  : the long-lived SSE stream (one giant span)

const BASE_SAMPLE_RATE = 0.1;
const DROP_ROUTES = ['/monitoring', '/api/notifications/stream'];

// Sentry's SamplingContext shape varies across v10 transports; we only read a
// few url-bearing fields, so accept `unknown` and narrow.
export function tracesSampler(samplingContext: unknown): number {
  const ctx = samplingContext as {
    name?: string;
    attributes?: Record<string, unknown>;
    normalizedRequest?: { url?: string };
  };
  const url: unknown =
    ctx?.attributes?.['http.target'] ?? ctx?.normalizedRequest?.url ?? ctx?.name ?? '';

  if (DROP_ROUTES.some((route) => String(url).includes(route))) return 0;
  return BASE_SAMPLE_RATE;
}
