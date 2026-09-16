'use client';

import { transformWebVitalsMetric, useReportWebVitals } from '@axiomhq/react';

// Browser web-vitals → POST /api/axiom (app/api/axiom/route.ts) → Axiom.
//
// `transformWebVitalsMetric` normalizes metric entries to plain values, so the DOM node
// web-vitals' bfcache FID polyfill puts in `entries` (`target: <body>`) can't break
// serialization — the failure that made next-axiom throw `Converting circular structure
// to JSON`. Sending is ours: @axiomhq/logging's transports pull the server-side
// @axiomhq/js client into the browser bundle and send without keepalive.
const RELAY_URL = '/api/axiom';

let queue: unknown[] = [];

function push(metric: Parameters<typeof transformWebVitalsMetric>[0]) {
  queue.push(transformWebVitalsMetric(metric));
}

// Called on visibilitychange. keepalive lets the request outlive the page, so the last
// CLS/INP reported as the tab closes still reaches the relay.
function flush() {
  if (queue.length === 0) return;
  const body = JSON.stringify(queue);
  queue = [];
  fetch(RELAY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {
    // Best-effort telemetry: a failed beacon must never surface in the page.
  });
}

function Reporter() {
  useReportWebVitals(push, flush);
  return null;
}

/** Skipped in development so local sessions don't post to the relay (same gate as Clarity). */
export function WebVitals() {
  if (process.env.NODE_ENV === 'development') return null;
  return <Reporter />;
}
