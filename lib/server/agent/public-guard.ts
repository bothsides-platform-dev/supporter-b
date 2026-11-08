import { isIP } from 'node:net';
import { appOrigins } from '@/lib/site-routing';

const WINDOW_MS = 60_000;
export const PUBLIC_AGENT_REQUESTS_PER_IP = 120;
export const PUBLIC_AGENT_REQUESTS_PER_WINDOW = 1_200;
export const PUBLIC_AGENT_MAX_TRACKED_IPS = 512;

// The current deployment has one PM2 process. These budgets protect this process;
// they are not a distributed quota and reset on restart. Address keys are cleared
// on the first request of a new window and never become event attributes.
let windowStart: number | undefined;
let total = 0;
const addresses = new Map<string, number>();

function rejection(status: number, code: string, retryAfter?: number): Response {
  return Response.json({ error: { code } }, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
      ...(retryAfter === undefined ? {} : { 'Retry-After': String(retryAfter) }),
    },
  });
}

function clientAddress(request: Request): string {
  // Public Caddy supplies the final hop. Never use a client-controlled first hop
  // or X-Forwarded-Host to expand either identity or the allowed host boundary.
  const forwarded = request.headers.get('x-forwarded-for');
  const candidate = forwarded?.slice(forwarded.lastIndexOf(',') + 1).trim();
  return candidate && candidate.length <= 45 && isIP(candidate)
    ? candidate.toLowerCase()
    : 'unknown';
}

function consumeBudget(request: Request): Response | null {
  const now = Date.now();
  if (windowStart === undefined || now < windowStart || now - windowStart >= WINDOW_MS) {
    windowStart = now;
    total = 0;
    addresses.clear();
  }

  const address = clientAddress(request);
  const count = addresses.get(address) ?? 0;
  if (
    total >= PUBLIC_AGENT_REQUESTS_PER_WINDOW ||
    count >= PUBLIC_AGENT_REQUESTS_PER_IP ||
    (!addresses.has(address) && addresses.size >= PUBLIC_AGENT_MAX_TRACKED_IPS)
  ) {
    return rejection(429, 'RATE_LIMITED', Math.max(1, Math.ceil((WINDOW_MS - (now - windowStart)) / 1_000)));
  }
  total += 1;
  addresses.set(address, count + 1);
  return null;
}

/** Public discovery only: no cookies, sessions, or caller-supplied workspace IDs. */
export function guardPublicAgentRequest(request: Request): Response | null {
  let buyer: URL;
  try {
    buyer = new URL(appOrigins().buyer);
    if (!['http:', 'https:'].includes(buyer.protocol) || buyer.username || buyer.password) {
      return rejection(503, 'SERVICE_UNAVAILABLE');
    }
  } catch {
    return rejection(503, 'SERVICE_UNAVAILABLE');
  }

  // Preserve the explicit port. Unknown and partner hosts are not public aliases
  // of the buyer catalog. The Request URL fallback supports Fetch-native callers
  // without a Host header; forwarded host/proto headers are deliberately ignored.
  const host = request.headers.get('host') ?? new URL(request.url).host;
  if (host.toLowerCase() !== buyer.host.toLowerCase()) return rejection(404, 'NOT_FOUND');

  // CLI clients normally have no Origin. Browser clients must have the configured
  // origin, including scheme and port. Public GET navigations from external docs
  // may be cross-site without Origin, so Sec-Fetch-Site alone is not a rejection.
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== buyer.origin) return rejection(403, 'ORIGIN_NOT_ALLOWED');

  return consumeBudget(request);
}

export function __resetPublicAgentBudgetForTest(): void {
  windowStart = undefined;
  total = 0;
  addresses.clear();
}
