// Integration smoke — live Centrifugo v6, the repo's real deploy/centrifugo/config.yaml.
//
// WHY THIS EXISTS (read before deleting/skipping): the v6 permission + delivery
// behaviors below are config-driven (allow_subscribe_for_client,
// allow_publish_for_subscriber, force_push_join_leave, history_size). Mocked unit
// tests give a false green — that is exactly how chat typing silently died in prod
// (v6 denies client publish by default; the config flag was missing). The ONLY guard
// against that whole class is talking to a real Centrifugo built from the repo config.
//
// GATED: the entire describe is skipped unless CENTRIFUGO_INTEGRATION=1, so the fast
// `pnpm test` loop never boots docker. CI runs it as a separate job (see ci.yml).
//
// PRE-REQ (the gate's contract): a Centrifugo v6 reachable at
// NEXT_PUBLIC_CENTRIFUGO_WS_URL (default ws://localhost:8000/connection/websocket),
// booted with the repo config and CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY matching
// CENTRIFUGO_TOKEN_HMAC_SECRET below. The task brief / ci.yml own the docker command.

import { Centrifuge } from 'centrifuge';
import type { JoinContext, Subscription } from 'centrifuge';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';

import { presenceWsChannel } from '@/lib/server/realtime/centrifugo';
import { issueCentrifugoConnectionToken } from '@/lib/server/realtime/token';

const RUN = process.env.CENTRIFUGO_INTEGRATION === '1';

// Must match the container's CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY so the JWTs we
// sign validate. Stubbed onto process.env so we can reuse the production token issuer
// (jose HS256, sub=userId, info.workspaceId) — the exact tokens prod connections carry.
const HMAC_SECRET = process.env.CENTRIFUGO_TOKEN_HMAC_SECRET ?? 'test-secret';
const WS_URL =
  process.env.NEXT_PUBLIC_CENTRIFUGO_WS_URL ?? 'ws://localhost:8000/connection/websocket';

// Per-test workspace id so reruns / parallel cases never share presence state.
let seq = 0;
const freshWs = () => `ws-${Date.now().toString(36)}-${seq++}`;

const clients: Centrifuge[] = [];

/**
 * Build a connected Centrifuge client for `(userId, workspaceId)` using the real
 * production token issuer. Resolves once the WebSocket connect handshake succeeds
 * (proves the HMAC secret + token shape are accepted by the container), rejects on
 * `error` or a 8s timeout. Tracked for afterAll cleanup.
 */
async function connectClient(userId: string, workspaceId: string): Promise<Centrifuge> {
  process.env.CENTRIFUGO_TOKEN_HMAC_SECRET = HMAC_SECRET;
  const token = await issueCentrifugoConnectionToken(userId, workspaceId);

  // ws@8's named/default export is the WebSocket class centrifuge `new`s in Node.
  const client = new Centrifuge(WS_URL, { websocket: WebSocket, token });
  clients.push(client);

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`connect timeout for ${userId}`)), 8_000);
    client.on('connected', () => {
      clearTimeout(timer);
      resolve();
    });
    client.on('error', (ctx) => {
      clearTimeout(timer);
      reject(new Error(`connect error for ${userId}: ${JSON.stringify(ctx.error)}`));
    });
    client.connect();
  });

  return client;
}

/**
 * Subscribe `client` to `channel`, resolving when the `subscribed` event fires and
 * rejecting on any subscription `error` (a v6 `103` permission denial surfaces here —
 * that rejection IS the regression this suite catches). 8s timeout.
 */
async function subscribe(client: Centrifuge, channel: string): Promise<Subscription> {
  const sub = client.newSubscription(channel);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`subscribe timeout for ${channel}`)), 8_000);
    sub.on('subscribed', () => {
      clearTimeout(timer);
      resolve();
    });
    sub.on('error', (ctx) => {
      clearTimeout(timer);
      reject(new Error(`subscribe error for ${channel}: ${JSON.stringify(ctx.error)}`));
    });
    sub.subscribe();
  });
  return sub;
}

afterAll(() => {
  for (const c of clients) {
    try {
      c.disconnect();
    } catch {
      /* best-effort teardown */
    }
  }
  clients.length = 0;
});

describe.skipIf(!RUN)('presence namespace — live Centrifugo v6', () => {
  beforeAll(() => {
    // Fail loud if a misconfig left the secret falsy — the issuer would throw an opaque
    // error mid-test otherwise.
    if (!HMAC_SECRET) throw new Error('CENTRIFUGO_TOKEN_HMAC_SECRET / fallback is empty');
  });

  it('client can subscribe to presence:ws (allow_subscribe_for_client)', async () => {
    const V = freshWs();
    const client = await connectClient('u1', V);
    // No throw === no `103`. v6 denies client subscribe by default; this only passes
    // because the presence namespace sets allow_subscribe_for_client: true.
    const sub = await subscribe(client, presenceWsChannel(V));
    expect(sub.state).toBe('subscribed');
  });

  it('connInfo.workspaceId surfaces in presence()', async () => {
    const V = freshWs();
    const client = await connectClient('u2', V);
    const sub = await subscribe(client, presenceWsChannel(V));

    const { clients: present } = await sub.presence();
    const entries = Object.values(present);
    expect(entries.length).toBeGreaterThanOrEqual(1);
    // The token's `info: { workspaceId: V }` round-trips through Centrifugo as connInfo —
    // proves the conn_info shape onlineWorkspaceIds/deriveActivity depend on.
    const owner = entries.find((e) => e.connInfo?.workspaceId === V);
    expect(owner, JSON.stringify(entries)).toBeDefined();
    expect(owner!.connInfo.workspaceId).toBe(V);
  });

  it('client can publish {state} (allow_publish_for_subscriber)', async () => {
    const V = freshWs();
    const client = await connectClient('u3', V);
    const sub = await subscribe(client, presenceWsChannel(V));
    // v6 denies client publish by default (this is the exact mechanism the chat-typing
    // fix relies on). No throw === allow_publish_for_subscriber is in effect.
    await expect(sub.publish({ state: 'idle' })).resolves.toBeDefined();
  });

  it('join is delivered to observers (force_push_join_leave)', async () => {
    const V = freshWs();
    const channel = presenceWsChannel(V);

    const observer = await connectClient('obs', V);
    const obsSub = observer.newSubscription(channel);

    const joinSeen = new Promise<JoinContext>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no join push within 8s')), 8_000);
      obsSub.on('join', (ctx) => {
        clearTimeout(timer);
        resolve(ctx);
      });
      obsSub.on('error', (ctx) => {
        clearTimeout(timer);
        reject(new Error(`observer subscribe error: ${JSON.stringify(ctx.error)}`));
      });
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('observer subscribe timeout')), 8_000);
      obsSub.on('subscribed', () => {
        clearTimeout(timer);
        resolve();
      });
      obsSub.subscribe();
    });

    // Second owner connects + subscribes → the observer must receive a join push.
    // v6 suppresses join/leave pushes unless force_push_join_leave is set.
    const second = await connectClient('owner2', V);
    await subscribe(second, channel);

    const ctx = await joinSeen;
    expect(ctx.info.connInfo?.workspaceId).toBe(V);
  });

  it('history seeds a late subscriber (history_size:1)', async () => {
    const V = freshWs();
    const channel = presenceWsChannel(V);

    const publisher = await connectClient('pub', V);
    const pubSub = await subscribe(publisher, channel);
    await pubSub.publish({ state: 'active' });

    // A client that joins AFTER the publish can read the retained last publication —
    // only because history_size:1 keeps it. (history_size:0 → empty.)
    const late = await connectClient('late', V);
    const lateSub = await subscribe(late, channel);
    const { publications } = await lateSub.history({ limit: 1 });
    expect(publications.length).toBe(1);
    expect(publications[0]!.data).toEqual({ state: 'active' });
  });
});
