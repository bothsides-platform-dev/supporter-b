import { getAxiomWebVitalsLogger } from '@/lib/observability/axiom-server';

// Unauthenticated ingest relay for browser web-vitals (components/shell/WebVitals.tsx
// posts JSON arrays here via @axiomhq/logging's ProxyTransport). The vendor's
// createProxyRouteHandler does the same forwarding (raw each event, then flush) with
// no limits at all; anyone can reach this URL, so it sits behind a byte cap, an event
// cap and a shape check. Accepted risk: no rate limit — see docs/THREAT_MODEL.md.

// A page reports ~6 web-vitals per batch, each well under 2KB once entries are
// normalized; these caps leave an order of magnitude of headroom.
const MAX_BODY_BYTES = 64 * 1024;
const MAX_EVENTS = 100;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function POST(request: Request): Promise<Response> {
  const logger = getAxiomWebVitalsLogger();
  if (!logger) return new Response(null, { status: 204 });

  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) {
    return new Response(null, { status: 413 });
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
    return new Response(null, { status: 413 });
  }

  let events: unknown;
  try {
    events = JSON.parse(body);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!Array.isArray(events) || !events.every(isPlainObject)) {
    return new Response(null, { status: 400 });
  }
  if (events.length > MAX_EVENTS) return new Response(null, { status: 413 });

  for (const event of events) logger.raw(event);
  try {
    await logger.flush();
  } catch {
    return new Response(null, { status: 502 });
  }
  return Response.json({ status: 'ok' });
}
