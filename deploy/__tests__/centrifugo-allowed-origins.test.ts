import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// Drift guard for the Centrifugo WebSocket origin allowlist.
//
// The browser bundle ships a single build-time NEXT_PUBLIC_CENTRIFUGO_WS_URL
// (wss://<APP_DOMAIN>/connection/websocket) that BOTH public hosts serve:
//   - supporter-b.com          (buyer)
//   - partner.supporter-b.com  (PG)
// Caddy serves both from one site block (deploy/Caddyfile) and proxies
// /connection/* to Centrifugo. Centrifugo v6 rejects the WS handshake when the
// browser Origin header is not in client.allowed_origins. So the allowlist MUST
// cover every public host, not just the apex — otherwise PG users get
// "WebSocket connection ... failed" and realtime chat silently dies for them.
//
// Regression: docker-compose.prod.yml once set
//   CENTRIFUGO_CLIENT_ALLOWED_ORIGINS: https://${APP_DOMAIN}
// which only allows the buyer apex and breaks every PG (partner.) connection.

function readProdCompose(): string {
  const path = fileURLToPath(new URL('../../docker-compose.prod.yml', import.meta.url));
  return readFileSync(path, 'utf8');
}

function allowedOriginsLine(compose: string): string {
  const line = compose
    .split('\n')
    .find((l) => l.includes('CENTRIFUGO_CLIENT_ALLOWED_ORIGINS'));
  if (!line) throw new Error('CENTRIFUGO_CLIENT_ALLOWED_ORIGINS not found in docker-compose.prod.yml');
  return line;
}

describe('Centrifugo allowed_origins (prod)', () => {
  it('allows the buyer apex host', () => {
    expect(allowedOriginsLine(readProdCompose())).toContain('https://${APP_DOMAIN');
  });

  it('allows the PG partner subdomain so PG WebSocket handshakes are not rejected', () => {
    // partner.${APP_DOMAIN} is the PG host; its Origin must be on the allowlist.
    expect(allowedOriginsLine(readProdCompose())).toContain('https://partner.${APP_DOMAIN}');
  });
});
