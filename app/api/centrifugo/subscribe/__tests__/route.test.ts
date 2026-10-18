// POST /api/centrifugo/subscribe — Centrifugo subscribe proxy ACL callback.
//
// This is the security boundary that keeps chat channels 비공개. Centrifugo
// calls this server-to-server endpoint when a client tries to subscribe to a
// channel; we answer allow/deny from signed connection `user` +
// `meta.workspaceId` (no browser cookie/session exists on a proxy call).
//
// Protocol (Centrifugo v6 proxy docs, verified via context7):
//   - Request body includes { user, channel, meta } because the proxy enables
//     include_connection_meta. We require meta.workspaceId.
//   - Channel convention (single source: chatChannel()):
//       chat:conversation:<conversationId>
//   - Allow  response body: { result: {} }
//   - Deny   response body: { error: { code, message } }
//   - HTTP status is ALWAYS 200 — allow/deny lives in the body. A non-200 is a
//     transport error to Centrifugo, NOT a clean deny. So every case asserts 200.
//
// ACL rule: allow iff the signed workspace is active/effective and is one side
// of the conversation. Every reject (non-member, missing conversation, non-chat channel,
// malformed channel/missing field) returns the SAME generic deny — never leak
// whether a conversation exists (privacy invariant).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import {
  seedBuyerWorkspace,
  seedMembership,
  seedPgWorkspace,
  seedRfp,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import {
  setupRfpActionEnv,
  teardownRfpActionEnv,
} from '@/lib/server/actions/rfp/__tests__/_setup';
import { rfpInvitations, workspaces } from '@/lib/db/schema';
import { getChatConversationRepo } from '@/lib/server/repositories/factory';
import {
  chatChannel,
  presenceWsChannel,
  teamChatChannel,
} from '@/lib/server/realtime/centrifugo';
import type { PgliteDB } from '@/lib/db/client-pglite';

import { POST } from '../route';

let db: PgliteDB;

function call(body: unknown, extraHeaders: Record<string, string> = { 'X-Centrifugo-Proxy-Secret': 'default-test-secret' }): Promise<Response> {
  return POST(
    new Request('http://localhost/api/centrifugo/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...extraHeaders },
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
    process.env.CENTRIFUGO_PROXY_SECRET = 'default-test-secret';
    db = await setupRfpActionEnv();
  });
  afterEach(() => {
    delete process.env.CENTRIFUGO_PROXY_SECRET;
    teardownRfpActionEnv();
  });

  it('(a) buyer member → allow ({ result: {} }, HTTP 200)', async () => {
    const { buyerUser, buyerWs, conv } = await seedPairWithMembers();

    const res = await call({
      user: buyerUser.id,
      meta: { workspaceId: buyerWs.id },
      channel: chatChannel(conv.id),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: {} });
  });

  it('(b) pg member → allow ({ result: {} }, HTTP 200)', async () => {
    const { pgUser, pgWs, conv } = await seedPairWithMembers();

    const res = await call({
      user: pgUser.id,
      meta: { workspaceId: pgWs.id },
      channel: chatChannel(conv.id),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: {} });
  });

  it('(c) third user in neither workspace → deny (HTTP 200, error body)', async () => {
    const { conv } = await seedPairWithMembers();
    const outsiderWs = await seedPgWorkspace(db, 'OUT', { name: '외부PG' });
    const outsider = await seedUser(db, { email: 'out@pg.com' });
    await seedMembership(db, outsiderWs.id, outsider.id, 'admin');

    const res = await call({
      user: outsider.id,
      meta: { workspaceId: outsiderWs.id },
      channel: chatChannel(conv.id),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result).toBeUndefined();
    expect(json.error).toBeDefined();
    expect(json.error.code).toBeGreaterThanOrEqual(400);
  });

  describe('signed connection workspace boundary', () => {
    it('denies a chat reached only through a pending or rejected membership outside token workspace', async () => {
      const { pgWs, conv } = await seedPairWithMembers();
      for (const approvalStatus of ['pending_approval', 'rejected'] as const) {
        const attacker = await seedUser(db, { email: `${approvalStatus}@attacker.test` });
        const tokenWorkspace = await seedBuyerWorkspace(db, {
          name: `정상 워크스페이스-${approvalStatus}`,
        });
        await seedMembership(db, tokenWorkspace.id, attacker.id, 'admin');
        await seedMembership(db, pgWs.id, attacker.id, 'member', { approvalStatus });

        const res = await call({
          user: attacker.id,
          meta: { workspaceId: tokenWorkspace.id },
          channel: chatChannel(conv.id),
        });
        expect((await res.json()).result).toBeUndefined();
      }
    });

    it('denies a pending PG membership even when token workspace names that PG', async () => {
      const { pgWs, conv } = await seedPairWithMembers();
      const pending = await seedUser(db, { email: 'pending-realtime@pg.test' });
      await seedMembership(db, pgWs.id, pending.id, 'member', {
        approvalStatus: 'pending_approval',
      });

      const res = await call({
        user: pending.id,
        meta: { workspaceId: pgWs.id },
        channel: chatChannel(conv.id),
      });
      expect((await res.json()).result).toBeUndefined();
    });

    it('denies an inactive token workspace even with an approved membership', async () => {
      const { buyerUser, buyerWs, conv } = await seedPairWithMembers();
      await db
        .update(workspaces)
        .set({ status: 'suspended' })
        .where(eq(workspaces.id, buyerWs.id));

      const res = await call({
        user: buyerUser.id,
        meta: { workspaceId: buyerWs.id },
        channel: chatChannel(conv.id),
      });
      expect((await res.json()).result).toBeUndefined();
    });

    it('denies missing or malformed connection metadata with the generic response', async () => {
      const { buyerUser, conv } = await seedPairWithMembers();
      const metadata = [
        undefined,
        {},
        { workspaceId: 'garbage' },
        { workspaceId: randomUUID() + ':extra' },
      ];
      for (const meta of metadata) {
        const res = await call({
          user: buyerUser.id,
          ...(meta === undefined ? {} : { meta }),
          channel: chatChannel(conv.id),
        });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({
          error: { code: 403, message: 'permission denied' },
        });
      }
    });

    it('scopes presence relationships to token workspace instead of another membership', async () => {
      const { buyerWs, pgWs } = await seedPairWithMembers();
      const attacker = await seedUser(db, { email: 'presence-scope@attacker.test' });
      const tokenWorkspace = await seedBuyerWorkspace(db, { name: '무관한 활성 워크스페이스' });
      await seedMembership(db, tokenWorkspace.id, attacker.id, 'admin');
      await seedMembership(db, pgWs.id, attacker.id, 'member');

      const res = await call({
        user: attacker.id,
        meta: { workspaceId: tokenWorkspace.id },
        channel: presenceWsChannel(buyerWs.id),
      });
      expect((await res.json()).result).toBeUndefined();
    });
  });

  it('(d) non-existent conversationId → deny (HTTP 200, error body)', async () => {
    const { buyerWs } = await seedPairWithMembers();
    const someUser = await seedUser(db, { email: 'ghost@x.com' });
    await seedMembership(db, buyerWs.id, someUser.id, 'member');

    const res = await call({
      user: someUser.id,
      meta: { workspaceId: buyerWs.id },
      channel: chatChannel(randomUUID()), // valid uuid, no such conversation
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result).toBeUndefined();
    expect(json.error).toBeDefined();
  });

  it('(e) non-chat channel → deny (HTTP 200, error body)', async () => {
    const { buyerUser, buyerWs } = await seedPairWithMembers();

    const res = await call({
      user: buyerUser.id,
      meta: { workspaceId: buyerWs.id },
      channel: 'notifications:42',
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result).toBeUndefined();
    expect(json.error).toBeDefined();
  });

  it('(f1) malformed channel — chat prefix but non-uuid id → deny (no throw, HTTP 200)', async () => {
    const { buyerUser, buyerWs } = await seedPairWithMembers();

    // Passes the prefix check, extracts "garbage"; findById('garbage') would
    // throw 22P02 invalid uuid if not guarded. Must be a clean deny.
    const res = await call({
      user: buyerUser.id,
      meta: { workspaceId: buyerWs.id },
      channel: 'chat:conversation:garbage',
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result).toBeUndefined();
    expect(json.error).toBeDefined();
  });

  it('(f2) missing channel field → deny (HTTP 200, error body)', async () => {
    const { buyerUser, buyerWs } = await seedPairWithMembers();

    const res = await call({ user: buyerUser.id, meta: { workspaceId: buyerWs.id } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result).toBeUndefined();
    expect(json.error).toBeDefined();
  });

  it('(f3) missing user field → deny (HTTP 200, error body)', async () => {
    const { buyerWs, conv } = await seedPairWithMembers();

    const res = await call({
      meta: { workspaceId: buyerWs.id },
      channel: chatChannel(conv.id),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result).toBeUndefined();
    expect(json.error).toBeDefined();
  });

  it('(f4) empty channel after prefix → deny (HTTP 200, error body)', async () => {
    const { buyerUser, buyerWs } = await seedPairWithMembers();

    const res = await call({
      user: buyerUser.id,
      meta: { workspaceId: buyerWs.id },
      channel: 'chat:conversation:',
    });
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
    const { buyerUser, buyerWs, conv } = await seedPairWithMembers();

    // Real member of `conv`, but the channel id carries an appended second id.
    // slice() yields "<conv.id>:<otherUuid>" which must FAIL the uuid gate —
    // otherwise a loose parser could resolve `conv` while the byte-exact channel
    // string differs from what the server publishes to.
    const res = await call({
      user: buyerUser.id,
      meta: { workspaceId: buyerWs.id },
      channel: `${chatChannel(conv.id)}:${randomUUID()}`,
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result).toBeUndefined();
    expect(json.error).toBeDefined();
  });

  it('(g2) valid uuid + path-like suffix ("/x", ".") → deny', async () => {
    const { buyerUser, buyerWs, conv } = await seedPairWithMembers();

    for (const suffix of ['/x', '.', ' ', '\n', '%00']) {
      const res = await call({
        user: buyerUser.id,
        meta: { workspaceId: buyerWs.id },
        channel: `${chatChannel(conv.id)}${suffix}`,
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.result, `suffix ${JSON.stringify(suffix)} must not allow`).toBeUndefined();
      expect(json.error).toBeDefined();
    }
  });

  it('(g3) chat prefix not at position 0 ("x:chat:conversation:<uuid>") → deny', async () => {
    const { buyerUser, buyerWs, conv } = await seedPairWithMembers();

    // startsWith() is anchored at 0, so a shifted prefix must fail the prefix
    // check (never reaching findById). Guards against a future switch to
    // .includes()/.indexOf() that would treat a mid-string prefix as a match.
    const res = await call({
      user: buyerUser.id,
      meta: { workspaceId: buyerWs.id },
      channel: `x:${chatChannel(conv.id)}`,
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result).toBeUndefined();
    expect(json.error).toBeDefined();
  });

  it('(g4) uuid wrapped in another channel namespace suffix → deny', async () => {
    const { buyerUser, buyerWs, conv } = await seedPairWithMembers();

    // "chat:conversation:<uuid>extra" — no separator, slice yields
    // "<uuid>extra" which is not a valid uuid → deny.
    const res = await call({
      user: buyerUser.id,
      meta: { workspaceId: buyerWs.id },
      channel: `${chatChannel(conv.id)}extra`,
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result).toBeUndefined();
    expect(json.error).toBeDefined();
  });

  // ── team:rfp:<rfpId>:<wsId> — RFP 팀 채팅 채널 ACL ─────────────────────────
  // Allow iff `user` is a member of <wsId> AND <wsId> has access to <rfpId>
  // (buyer owns it, or PG holds an invitation — invRepo.canAccess). The wsId
  // segment keeps buyer/PG team threads on disjoint channels; cross-workspace
  // subscriptions must deny even when the user legitimately accesses the SAME
  // RFP from the other side (sealed-bid invariant).

  async function seedTeamScene() {
    const { buyerUser, buyerWs, pgUser, pgWs } = await seedPairWithMembers();
    const rfp = await seedRfp(db, { buyerWsId: buyerWs.id, createdBy: buyerUser.id });
    await db.insert(rfpInvitations).values({
      id: randomUUID(),
      rfpId: rfp.id,
      pgWsId: pgWs.id,
      tokenHash: `hash-${randomUUID()}`,
      sentAt: new Date(),
      expiresAt: new Date(Date.now() + 86_400_000),
      status: 'pending',
    });
    return { buyerUser, buyerWs, pgUser, pgWs, rfp };
  }

  it('(t1) buyer member of the owning ws → allow on its team channel', async () => {
    const { buyerUser, buyerWs, rfp } = await seedTeamScene();

    const res = await call({
      user: buyerUser.id,
      meta: { workspaceId: buyerWs.id },
      channel: teamChatChannel(rfp.id, buyerWs.id),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: {} });
  });

  it('(t2) invited PG member → allow on the PG team channel', async () => {
    const { pgUser, pgWs, rfp } = await seedTeamScene();

    const res = await call({
      user: pgUser.id,
      meta: { workspaceId: pgWs.id },
      channel: teamChatChannel(rfp.id, pgWs.id),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: {} });
  });

  it('(t3) cross-workspace subscribe (PG user → buyer team channel, and vice versa) → deny', async () => {
    const { buyerUser, buyerWs, pgUser, pgWs, rfp } = await seedTeamScene();

    // PG user has RFP access but is NOT a member of the buyer ws.
    const a = await call({
      user: pgUser.id,
      meta: { workspaceId: pgWs.id },
      channel: teamChatChannel(rfp.id, buyerWs.id),
    });
    expect(a.status).toBe(200);
    expect((await a.json()).result).toBeUndefined();

    // Buyer user owns the RFP but is NOT a member of the PG ws.
    const b = await call({
      user: buyerUser.id,
      meta: { workspaceId: buyerWs.id },
      channel: teamChatChannel(rfp.id, pgWs.id),
    });
    expect(b.status).toBe(200);
    expect((await b.json()).result).toBeUndefined();
  });

  it('(t4) member of a ws WITHOUT rfp access (uninvited PG) → deny', async () => {
    const { rfp } = await seedTeamScene();
    const strangerWs = await seedPgWorkspace(db, 'STR', { name: '낯선페이' });
    const stranger = await seedUser(db, { email: 'stranger@pg.com' });
    await seedMembership(db, strangerWs.id, stranger.id, 'admin');

    const res = await call({
      user: stranger.id,
      meta: { workspaceId: strangerWs.id },
      channel: teamChatChannel(rfp.id, strangerWs.id),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result).toBeUndefined();
    expect(json.error).toBeDefined();
  });

  it('(t5) unknown rfp id → deny', async () => {
    const { buyerUser, buyerWs } = await seedTeamScene();

    const res = await call({
      user: buyerUser.id,
      meta: { workspaceId: buyerWs.id },
      channel: teamChatChannel(randomUUID(), buyerWs.id),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result).toBeUndefined();
    expect(json.error).toBeDefined();
  });

  it('(t6) malformed team channels (segment count / non-uuid) → deny, no throw', async () => {
    const { buyerUser, buyerWs, rfp } = await seedTeamScene();

    const vectors = [
      `team:rfp:${rfp.id}`, // missing ws segment
      `team:rfp:${rfp.id}:${buyerWs.id}:${randomUUID()}`, // extra segment
      `team:rfp:garbage:${buyerWs.id}`, // non-uuid rfp
      `team:rfp:${rfp.id}:garbage`, // non-uuid ws
      'team:rfp::', // empty segments
    ];
    for (const channel of vectors) {
      const res = await call({
        user: buyerUser.id,
        meta: { workspaceId: buyerWs.id },
        channel,
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.result, `channel ${channel} must not allow`).toBeUndefined();
      expect(json.error).toBeDefined();
    }
  });

  // ── CENTRIFUGO_PROXY_SECRET — 환경변수 기반 공유 비밀 헤더 게이트 ─────────────
  // env 미설정 → 거부. env 설정 → X-Centrifugo-Proxy-Secret 상수시간 검증.

  describe('secret header gate (CENTRIFUGO_PROXY_SECRET)', () => {
    const REAL_SECRET = 'test-proxy-secret-abc123';

    afterEach(() => {
      delete process.env.CENTRIFUGO_PROXY_SECRET;
    });

    it('(s1) env set + no X-Centrifugo-Proxy-Secret header → deny regardless of ACL', async () => {
      process.env.CENTRIFUGO_PROXY_SECRET = REAL_SECRET;
      const { buyerUser, buyerWs, conv } = await seedPairWithMembers();

      const res = await call({
        user: buyerUser.id,
        meta: { workspaceId: buyerWs.id },
        channel: chatChannel(conv.id),
      }, {}); // no secret header
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.result).toBeUndefined();
      expect(json.error).toBeDefined();
    });

    it('(s2) env set + wrong X-Centrifugo-Proxy-Secret → deny', async () => {
      process.env.CENTRIFUGO_PROXY_SECRET = REAL_SECRET;
      const { buyerUser, buyerWs, conv } = await seedPairWithMembers();

      const res = await call(
        {
          user: buyerUser.id,
          meta: { workspaceId: buyerWs.id },
          channel: chatChannel(conv.id),
        },
        { 'X-Centrifugo-Proxy-Secret': 'wrong-secret' },
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.result).toBeUndefined();
      expect(json.error).toBeDefined();
    });

    it('(s3) env set + correct X-Centrifugo-Proxy-Secret → ACL proceeds normally', async () => {
      process.env.CENTRIFUGO_PROXY_SECRET = REAL_SECRET;
      const { buyerUser, buyerWs, conv } = await seedPairWithMembers();

      const res = await call(
        {
          user: buyerUser.id,
          meta: { workspaceId: buyerWs.id },
          channel: chatChannel(conv.id),
        },
        { 'X-Centrifugo-Proxy-Secret': REAL_SECRET },
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ result: {} });
    });

    it('(s4) missing server secret denies even valid membership', async () => {
      delete process.env.CENTRIFUGO_PROXY_SECRET;
      const { buyerUser, buyerWs, conv } = await seedPairWithMembers();

      const res = await call({
        user: buyerUser.id,
        meta: { workspaceId: buyerWs.id },
        channel: chatChannel(conv.id),
      });
      expect(res.status).toBe(200);
      expect((await res.json()).error).toBeDefined();
    });
  });

  // presence:ws:<workspaceId> — 관계 게이트 ACL (멤버십∨대화∨초대∨pending 콜드피치).
  // D1 공개 모델을 대체(AR-1 완화, docs/THREAT_MODEL.md §2.3). 거부는 다른 분기와
  // byte-identical generic deny — 워크스페이스 존재/관계 오라클 금지.
  describe('presence channel ACL', () => {
    it('(p1) 자기 워크스페이스 멤버 → allow (자기 브로드캐스트)', async () => {
      const { buyerUser, buyerWs } = await seedPairWithMembers();
      const res = await call({
        user: buyerUser.id,
        meta: { workspaceId: buyerWs.id },
        channel: presenceWsChannel(buyerWs.id),
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ result: {} });
    });

    it('(p2) 대화 상대 워크스페이스 → allow (양방향)', async () => {
      const { buyerUser, pgUser, buyerWs, pgWs } = await seedPairWithMembers();
      const r1 = await call({
        user: pgUser.id,
        meta: { workspaceId: pgWs.id },
        channel: presenceWsChannel(buyerWs.id),
      });
      expect(await r1.json()).toEqual({ result: {} });
      const r2 = await call({
        user: buyerUser.id,
        meta: { workspaceId: buyerWs.id },
        channel: presenceWsChannel(pgWs.id),
      });
      expect(await r2.json()).toEqual({ result: {} });
    });

    it('(p3) 대화 없이 RFP 초대 쌍만 있어도 → allow (PG가 구매사 관찰)', async () => {
      const buyerUser = await seedUser(db, { email: 'b2@b.com' });
      const buyerWs = await seedBuyerWorkspace(db, { name: '구매사2' });
      await seedMembership(db, buyerWs.id, buyerUser.id, 'admin');
      const pgUser = await seedUser(db, { email: 'p2@pg.com' });
      const pgWs = await seedPgWorkspace(db, 'PG2', { name: '페이2' });
      await seedMembership(db, pgWs.id, pgUser.id, 'admin');
      const rfp = await seedRfp(db, { buyerWsId: buyerWs.id, createdBy: buyerUser.id });
      await db.insert(rfpInvitations).values({
        rfpId: rfp.id,
        pgWsId: pgWs.id,
        tokenHash: `th-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      });

      const res = await call({
        user: pgUser.id,
        meta: { workspaceId: pgWs.id },
        channel: presenceWsChannel(buyerWs.id),
      });
      expect(await res.json()).toEqual({ result: {} });
    });

    it('(p4) 무관한 사용자 → generic deny (chat deny 와 byte-identical)', async () => {
      const { buyerWs, conv } = await seedPairWithMembers();
      const outsiderWs = await seedPgWorkspace(db, 'OUT2', { name: '외부PG2' });
      const outsider = await seedUser(db, { email: 'out2@pg.com' });
      await seedMembership(db, outsiderWs.id, outsider.id, 'admin');

      const presenceDeny = await call({
        user: outsider.id,
        meta: { workspaceId: outsiderWs.id },
        channel: presenceWsChannel(buyerWs.id),
      });
      const chatDeny = await call({
        user: outsider.id,
        meta: { workspaceId: outsiderWs.id },
        channel: chatChannel(conv.id),
      });
      expect(presenceDeny.status).toBe(200);
      expect(await presenceDeny.json()).toEqual(await chatDeny.json());
    });

    it('(p5) malformed suffix — 비uuid·빈값·꼬리 세그먼트·프리픽스 스머글링 전부 deny, no throw', async () => {
      const { buyerUser, buyerWs } = await seedPairWithMembers();
      const channels = [
        'presence:ws:garbage',
        'presence:ws:',
        `presence:ws:${buyerWs.id}:extra`,
        `x:presence:ws:${buyerWs.id}`,
        `presence:ws:${buyerWs.id} `,
      ];
      for (const channel of channels) {
        const res = await call({
          user: buyerUser.id,
          meta: { workspaceId: buyerWs.id },
          channel,
        });
        expect(res.status).toBe(200);
        const json = (await res.json()) as { result?: unknown; error?: unknown };
        expect(json.result).toBeUndefined();
        expect(json.error).toBeDefined();
      }
    });
  });
});
