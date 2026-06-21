'use client';

/**
 * centrifuge-client — per-tab Centrifuge singleton factory.
 *
 * Graceful no-op contract (load-bearing): when NEXT_PUBLIC_CENTRIFUGO_WS_URL is
 * unset — which is the case in dev and EVERY test environment — this returns
 * `null` and NEVER constructs a client, opens a socket, or throws. The chat UI
 * must work off the static load-on-open loaders alone; the live connection is a
 * pure enhancement that only activates when the env points at a server.
 *
 * Auth: the centrifuge `getToken` callback POSTs /api/centrifugo/connection-token
 * (Auth.js cookie auto-sent same-origin) and returns the issued JWT. Connection
 * is lazy — Centrifuge.connect() is called on first subscribe by the consumer
 * (the hook), not here.
 */
import { Centrifuge } from 'centrifuge';

import { http } from '@/lib/http';

// Presence correctness depends on the workspace-switch path tearing down this
// connection (disconnectCentrifuge below): the connection-token binds
// info.workspaceId at construction, so a new active workspace needs a fresh client.
let client: Centrifuge | null = null;
// Track that we've resolved the env once, so an unconfigured tab doesn't retry
// the (cheap) string read on every call. `null` is a valid resolved value.
let resolved = false;

async function getConnectionToken(): Promise<string> {
  const { token } = await http
    .post('/api/centrifugo/connection-token')
    .json<{ token: string }>();
  return token;
}

/**
 * Return the per-tab Centrifuge singleton, or `null` when realtime is not
 * configured. Reads the env inside the function body (not module scope) so the
 * decision reflects the runtime environment.
 */
export function getCentrifuge(): Centrifuge | null {
  if (resolved) return client;
  resolved = true;

  const url = process.env.NEXT_PUBLIC_CENTRIFUGO_WS_URL;
  if (!url) {
    client = null;
    return null;
  }

  client = new Centrifuge(url, {
    getToken: () => getConnectionToken(),
  });
  return client;
}

/** Tear down the singleton (workspace switch — the token's info.workspaceId is
 *  bound at construction, so a new workspace needs a fresh connection). */
export function disconnectCentrifuge(): void {
  client?.disconnect();
  client = null;
  resolved = false;
}

/** Test-only — drop the cached singleton + resolution flag. */
export function __resetCentrifugeForTest(): void {
  client = null;
  resolved = false;
}
