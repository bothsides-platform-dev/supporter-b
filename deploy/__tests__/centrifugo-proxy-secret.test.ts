import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// Drift guard for the Centrifugo subscribe-proxy shared-secret header.
//
// The app (app/api/centrifugo/subscribe/route.ts) hardens the subscribe proxy
// endpoint with a shared secret: when CENTRIFUGO_PROXY_SECRET is set, it rejects
// EVERY subscribe whose X-Centrifugo-Proxy-Secret header doesn't match. For that
// to work, Centrifugo MUST actually send the header on each proxy call.
//
// Regression (prod outage 2026-06-20): the config used the Centrifugo v5 key
//   channel.proxy.subscribe.static_http_headers
// which Centrifugo v6 does NOT recognise — it logs `unknown key in configuration
// file` and silently drops the header. Result: the app saw no header against a
// set secret and denied EVERY subscribe → realtime chat globally dead (both
// buyer and PG), WS connected but no channel ever subscribed.
//
// v6 moved the field to `channel.proxy.subscribe.http.static_headers` (a map),
// and v6.3.0+ extrapolates ${CENTRIFUGO_VAR_*} env vars INTO that map — so the
// secret stays in env (never a literal in config) and is bridged by
// docker-compose. This guard locks in the working v6 shape and the env bridge,
// and bans the dead v5 key from ever returning.

function read(relFromHere: string): string {
  return readFileSync(fileURLToPath(new URL(relFromHere, import.meta.url)), 'utf8');
}

const config = read('../centrifugo/config.yaml');
const compose = read('../../docker-compose.prod.yml');
const devCompose = read('../../docker-compose.yml');

describe('Centrifugo subscribe-proxy secret header (v6)', () => {
  it('does NOT use the dead v5 key static_http_headers (the footgun)', () => {
    // v6 logs "unknown key in configuration file" and drops the header → every
    // subscribe denied. Ban it as an ACTIVE yaml key (a comment warning about
    // the dead key is fine — it starts with '#', so this regex won't match it).
    expect(config).not.toMatch(/^\s*static_http_headers\s*:/m);
  });

  it('configures the proxy secret header via the v6 http.static_headers map', () => {
    // v6 path: channel.proxy.subscribe.http.static_headers
    expect(config).toMatch(/^\s+http:\s*$/m);
    expect(config).toMatch(/^\s+static_headers:\s*$/m);
    expect(config).toMatch(/X-Centrifugo-Proxy-Secret:\s*["']?\$\{CENTRIFUGO_VAR_PROXY_SECRET\}/);
  });

  it('injects the secret from env (no literal secret in config.yaml)', () => {
    // The value must be the ${CENTRIFUGO_VAR_*} placeholder, not a hardcoded
    // secret — Centrifugo v6.3.0+ extrapolates it from the env at boot.
    expect(config).toContain('${CENTRIFUGO_VAR_PROXY_SECRET}');
  });

  it('bridges CENTRIFUGO_PROXY_SECRET into the container as CENTRIFUGO_VAR_PROXY_SECRET', () => {
    // Single source of truth: the app reads CENTRIFUGO_PROXY_SECRET directly;
    // the container must receive the SAME value under the name Centrifugo
    // extrapolates (CENTRIFUGO_VAR_PROXY_SECRET). If config references the var,
    // compose MUST define it, or the header is empty and the footgun returns.
    expect(compose).toMatch(
      /CENTRIFUGO_VAR_PROXY_SECRET:\s*\$\{CENTRIFUGO_PROXY_SECRET(:-)?\}/,
    );
  });

  it('dev compose bridges the SAME var — the realtime profile mounts the SAME config.yaml', () => {
    // docker-compose.yml (--profile realtime) mounts deploy/centrifugo/config.yaml,
    // which references ${CENTRIFUGO_VAR_PROXY_SECRET}. Without this bridge, a dev
    // who sets CENTRIFUGO_PROXY_SECRET locally gets a header-less container → the
    // app denies EVERY subscribe → chat/presence silently dead in dev.
    expect(devCompose).toMatch(
      /CENTRIFUGO_VAR_PROXY_SECRET:\s*\$\{CENTRIFUGO_PROXY_SECRET(:-)?\}/,
    );
  });
});
