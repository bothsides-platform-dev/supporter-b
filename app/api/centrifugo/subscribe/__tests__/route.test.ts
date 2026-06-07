// POST /api/centrifugo/subscribe — Centrifugo subscribe proxy ACL callback.
//
// This is the security boundary that keeps chat channels 비공개. Centrifugo
// calls this server-to-server endpoint when a client tries to subscribe to a
// channel; we answer allow/deny based ONLY on the payload `user` + workspace
// membership (no browser cookie/session exists on a proxy call).
//
// Protocol (Centrifugo v6 proxy docs, verified via context7):
//   - Request body: { client, transport, protocol, encoding, user, channel }.
//     We read `user` (userId) and `channel`.
//   - Channel convention (single source: chatChannel()):
//       chat:conversation:<conversationId>
//   - Allow  response body: { result: {} }
//   - Deny   response body: { error: { code, message } }
//   - HTTP status is ALWAYS 200 — allow/deny lives in the body. A non-200 is a
//     transport error to Centrifugo, NOT a clean deny. So every case asserts 200.
//
// ACL rule: allow iff `user` is a member of the conversation's buyer OR pg
// workspace. Every reject (non-member, missing conversation, non-chat channel,
// malformed channel/missing field) returns the SAME generic deny — never leak
// whether a conversation exists (privacy invariant).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import {
  seedBuyerWorkspace,
  seedMembership,
  seedPgWorkspace,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import {
  setupRfpActionEnv,
  teardownRfpActionEnv,
} from '@/lib/server/actions/rfp/__tests__/_setup';
import { getChatConversationRepo } from '@/lib/server/repositories/factory';
import { chatChannel } from '@/lib/server/realtime/centrifugo';
import type { PgliteDB } from '@/lib/db/client-pglite';

import { POST } from '../route';

let db: PgliteDB;

function call(body: unknown): Promise<Response> {
  return POST(
    new Request('http://localhost/api/centrifugo/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

async function seedPairWithMembers() {
  const buyerUser = await seedUser(db, { email: 'buyer@b.com', name: '구매사담당' });
  const buyerWs = await seedBuyerWorkspace(db, { name: '구매사' });
  await seedMembership(db, buyerWs.id, buyerUser.id, 'admin');

  const pgUser = await seedUser(db, { email: 'sales@pg.com', name: 'PG영업' });
  const pgWs = await seedPgWorkspace(db, 'PG', { name: 'OO페이' });
  await seedMembership(db, pgWs.id, pgUser.id, 'admin');

  const conv = await (await getChatConversationRepo()).findOrCreatePair(
    buyerWs.id,
    pgWs.id,
  );
  return { buyerUser, buyerWs, pgUser, pgWs, conv };
}

describe('POST /api/centrifugo/subscribe (subscribe proxy ACL)', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
  });
  afterEach(() => {
    teardownRfpActionEnv();
  });

  it('(a) buyer member → allow ({ result: {} }, HTTP 200)', async () => {
    const { buyerUser, conv } = await seedPairWithMembers();

    const res = await call({ user: buyerUser.id, channel: chatChannel(conv.id) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: {} });
  });

  it('(b) pg member → allow ({ result: {} }, HTTP 200)', async () => {
    const { pgUser, conv } = await seedPairWithMembers();

    const res = await call({ user: pgUser.id, channel: chatChannel(conv.id) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: {} });
  });

  it('(c) third user in neither workspace → deny (HTTP 200, error body)', async () => {
    const { conv } = await seedPairWithMembers();
    const outsiderWs = await seedPgWorkspace(db, 'OUT', { name: '외부PG' });
    const outsider = await seedUser(db, { email: 'out@pg.com' });
    await seedMembership(db, outsiderWs.id, outsider.id, 'admin');

    const res = await call({ user: outsider.id, channel: chatChannel(conv.id) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result).toBeUndefined();
    expect(json.error).toBeDefined();
    expect(json.error.code).toBeGreaterThanOrEqual(400);
  });

  it('(d) non-existent conversationId → deny (HTTP 200, error body)', async () => {
    await seedPairWithMembers();
    const someUser = await seedUser(db, { email: 'ghost@x.com' });

    const res = await call({
      user: someUser.id,
      channel: chatChannel(randomUUID()), // valid uuid, no such conversation
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result).toBeUndefined();
    expect(json.error).toBeDefined();
  });

  it('(e) non-chat channel → deny (HTTP 200, error body)', async () => {
    const { buyerUser } = await seedPairWithMembers();

    const res = await call({ user: buyerUser.id, channel: 'notifications:42' });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result).toBeUndefined();
    expect(json.error).toBeDefined();
  });

  it('(f1) malformed channel — chat prefix but non-uuid id → deny (no throw, HTTP 200)', async () => {
    const { buyerUser } = await seedPairWithMembers();

    // Passes the prefix check, extracts "garbage"; findById('garbage') would
    // throw 22P02 invalid uuid if not guarded. Must be a clean deny.
    const res = await call({ user: buyerUser.id, channel: 'chat:conversation:garbage' });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result).toBeUndefined();
    expect(json.error).toBeDefined();
  });

  it('(f2) missing channel field → deny (HTTP 200, error body)', async () => {
    const { buyerUser } = await seedPairWithMembers();

    const res = await call({ user: buyerUser.id });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result).toBeUndefined();
    expect(json.error).toBeDefined();
  });

  it('(f3) missing user field → deny (HTTP 200, error body)', async () => {
    const { conv } = await seedPairWithMembers();

    const res = await call({ channel: chatChannel(conv.id) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result).toBeUndefined();
    expect(json.error).toBeDefined();
  });

  it('(f4) empty channel after prefix → deny (HTTP 200, error body)', async () => {
    const { buyerUser } = await seedPairWithMembers();

    const res = await call({ user: buyerUser.id, channel: 'chat:conversation:' });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result).toBeUndefined();
    expect(json.error).toBeDefined();
  });

  // ── Adversarial channel-parse vectors (privacy invariant) ──────────────────
  // The parse is startsWith(prefix) + slice + z.string().uuid(). These probe
  // whether a member of a REAL conversation can smuggle a second/foreign id, a
  // path-like suffix, or shift the prefix off position 0 to reach a channel the
  // server never publishes to or that names a different conversation. zod's
  // anchored ^…$ uuid should deny every one; these are regression guards so a
  // future refactor to .includes()/substring-regex can't silently widen the ACL.

  it('(g1) valid uuid + ":" + second uuid suffix → deny (no trailing smuggle)', async () => {
    const { buyerUser, conv } = await seedPairWithMembers();

    // Real member of `conv`, but the channel id carries an appended second id.
    // slice() yields "<conv.id>:<otherUuid>" which must FAIL the uuid gate —
    // otherwise a loose parser could resolve `conv` while the byte-exact channel
    // string differs from what the server publishes to.
    const res = await call({
      user: buyerUser.id,
      channel: `${chatChannel(conv.id)}:${randomUUID()}`,
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result).toBeUndefined();
    expect(json.error).toBeDefined();
  });

  it('(g2) valid uuid + path-like suffix ("/x", ".") → deny', async () => {
    const { buyerUser, conv } = await seedPairWithMembers();

    for (const suffix of ['/x', '.', ' ', '\n', '%00']) {
      const res = await call({
        user: buyerUser.id,
        channel: `${chatChannel(conv.id)}${suffix}`,
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.result, `suffix ${JSON.stringify(suffix)} must not allow`).toBeUndefined();
      expect(json.error).toBeDefined();
    }
  });

  it('(g3) chat prefix not at position 0 ("x:chat:conversation:<uuid>") → deny', async () => {
    const { buyerUser, conv } = await seedPairWithMembers();

    // startsWith() is anchored at 0, so a shifted prefix must fail the prefix
    // check (never reaching findById). Guards against a future switch to
    // .includes()/.indexOf() that would treat a mid-string prefix as a match.
    const res = await call({
      user: buyerUser.id,
      channel: `x:${chatChannel(conv.id)}`,
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result).toBeUndefined();
    expect(json.error).toBeDefined();
  });

  it('(g4) uuid wrapped in another channel namespace suffix → deny', async () => {
    const { buyerUser, conv } = await seedPairWithMembers();

    // "chat:conversation:<uuid>extra" — no separator, slice yields
    // "<uuid>extra" which is not a valid uuid → deny.
    const res = await call({
      user: buyerUser.id,
      channel: `${chatChannel(conv.id)}extra`,
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result).toBeUndefined();
    expect(json.error).toBeDefined();
  });
});
