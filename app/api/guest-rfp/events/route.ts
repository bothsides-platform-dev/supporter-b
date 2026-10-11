import {
  guestEventSchema,
  createGuestEventLimiter,
  readGuestEventBody,
} from '@/lib/server/guest-rfp/request';
import { recordGuestEvent } from '@/lib/server/services/guest-rfp';
import { logger } from '@/lib/observability/logger';
import { appOrigins } from '@/lib/site-routing';
export const runtime = 'nodejs';
const allow = createGuestEventLimiter();
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  // Next's Request.url uses its private listening host behind Caddy TLS.
  // Pin both the browser origin and ingress Host to configured buyer routing;
  // never trust client-supplied forwarded host/protocol to widen this allowlist.
  const buyer = new URL(appOrigins().buyer);
  const host = request.headers.get('host') ?? new URL(request.url).host;
  if (
    origin !== buyer.origin || host !== buyer.host ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  )
    return new Response(null, { status: 403 });
  // Caddy overwrites X-Forwarded-For at the only public ingress; never store raw IPs.
  const ip =
    request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() ??
    'unknown';
  if (!allow(ip)) return new Response(null, { status: 429 });
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    return new Response(null, { status: 415 });
  if (Number(request.headers.get('content-length')) > 4096)
    return new Response(null, { status: 413 });
  let parsed;
  try {
    const body = await readGuestEventBody(request);
    if (body === null) return new Response(null, { status: 413 });
    parsed = guestEventSchema.safeParse(JSON.parse(body));
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!parsed.success) return new Response(null, { status: 400 });
  try {
    await recordGuestEvent(parsed.data);
  } catch {
    logger.warn('guest_rfp.event_failed', {
      draftId: parsed.data.draftId,
      event: parsed.data.event,
    });
  }
  return new Response(null, { status: 204 });
}
