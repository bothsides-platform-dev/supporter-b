import { readBoundedBody } from '@/lib/server/http/bounded-body';
import { getAxiomWebVitalsLogger } from '@/lib/observability/axiom-server';

// Unauthenticated ingest relay for browser web-vitals (components/shell/WebVitals.tsx
// posts JSON arrays here). Anyone can reach this URL — `/api` is outside the auth proxy
// matcher — so every defence lives in this handler: a byte cap enforced while streaming,
// an event cap, and a shape check that only admits re-serializable web-vital events.
// Per-process IP and aggregate budgets bound ingestion between restarts.
//
// Events are handed to the Axiom batching client and the response returns right away;
// the client's own 1s timer ships them. Awaiting a flush here would make every beacon
// queue behind one Axiom round-trip (its flushes are serialized), and the SDK swallows
// ingest failures anyway, so there is no failure to report back.

// A page reports ~6 web-vitals per batch, each well under 2KB once entries are
// normalized; these caps leave an order of magnitude of headroom.
const MAX_BODY_BYTES = 64 * 1024;
const MAX_EVENTS = 100;
const MAX_EVENT_DEPTH = 100;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// JSON.stringify's maximum nesting varies by Node/V8 version. Keep the accepted shape
// deterministic so one deeply nested event cannot poison the shared Axiom batch.
function isWithinEventDepth(value: unknown): boolean {
  const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) break;

    if (Array.isArray(current.value)) {
      if (current.depth > MAX_EVENT_DEPTH) return false;
      for (const child of current.value) {
        pending.push({ value: child, depth: current.depth + 1 });
      }
    } else if (isPlainObject(current.value)) {
      if (current.depth > MAX_EVENT_DEPTH) return false;
      for (const child of Object.values(current.value)) {
        pending.push({ value: child, depth: current.depth + 1 });
      }
    }
  }

  return true;
}

function isRelayableWebVital(value: unknown): boolean {
  if (!isPlainObject(value) || value.source !== 'web-vital' || !isPlainObject(value.webVital)) {
    return false;
  }
  if (!isWithinEventDepth(value)) return false;
  try {
    JSON.stringify(value);
    return true;
  } catch {
    return false;
  }
}

const addresses = new Map<string, number>();
let windowStart = 0;
let requests = 0;
function admit(request: Request): boolean {
  const now = Date.now();
  if (now - windowStart >= 60000) {
    windowStart = now;
    requests = 0;
    addresses.clear();
  }
  const ip = request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() || 'unknown';
  if (requests >= 300 || (addresses.get(ip) ?? 0) >= 60) return false;
  requests++;
  addresses.set(ip, (addresses.get(ip) ?? 0) + 1);
  return true;
}

export async function POST(request: Request): Promise<Response> {
  const logger = getAxiomWebVitalsLogger();
  if (!logger) return new Response(null, { status: 204 });

  if (!admit(request)) return new Response(null, { status: 429 });

  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) {
    return new Response(null, { status: 413 });
  }
  const body = await readBoundedBody(request);
  if (typeof body === 'number') return new Response(null, { status: body });

  let events: unknown;
  try {
    events = JSON.parse(body);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!Array.isArray(events)) return new Response(null, { status: 400 });
  if (events.length > MAX_EVENTS) return new Response(null, { status: 413 });
  if (!events.every(isRelayableWebVital)) return new Response(null, { status: 400 });

  for (const event of events) logger.raw(event);
  return Response.json({ status: 'ok' });
}
