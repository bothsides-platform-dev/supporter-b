// Sentry `tracesSampler` — replaces a flat `tracesSampleRate: 0.1` so we can
// drop high-volume / low-value transactions and protect the free-plan spans
// quota. PURE module (no @sentry imports) — imported by the three init files.
//
//   - `/monitoring`               : the Sentry tunnel route (self-traffic)
//   - `/api/notifications/stream`  : the long-lived SSE stream (one giant span)

const BASE_SAMPLE_RATE = 0.1;
const DROP_ROUTES = ['/monitoring', '/api/notifications/stream'];

export function tracesSampler(samplingContext: any): number {
  const url: string =
    samplingContext?.attributes?.['http.target'] ??
    samplingContext?.normalizedRequest?.url ??
    samplingContext?.name ??
    '';

  if (DROP_ROUTES.some((route) => String(url).includes(route))) return 0;
  return BASE_SAMPLE_RATE;
}
