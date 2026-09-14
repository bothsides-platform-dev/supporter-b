'use client';

import { Logger, ProxyTransport } from '@axiomhq/logging';
import { createWebVitalsComponent } from '@axiomhq/react';

// Browser web-vitals → POST /api/axiom (app/api/axiom/route.ts) → Axiom. The SDK
// normalizes metric entries to plain values before sending, so the DOM node carried by
// web-vitals' bfcache FID polyfill (`target: <body>`) cannot break serialization — the
// failure that made next-axiom throw `Converting circular structure to JSON`.
export const webVitalsLogger = new Logger({
  transports: [new ProxyTransport({ url: '/api/axiom', autoFlush: true })],
});

const Reporter = createWebVitalsComponent(webVitalsLogger);

/** Skipped in development so local sessions don't post to the relay (same gate as Clarity). */
export function WebVitals() {
  if (process.env.NODE_ENV === 'development') return null;
  return <Reporter />;
}
