// flushChatDigests — the dedicated processor that drains delayed chat.message
// digest rows (enqueued by sendChatMessageAction at the window END). It owns the
// layer 1/3/4 behaviour at SEND time, where the generic outbox flush deliberately
// skips chat.message rows:
//
//   - Parse dedupeKey → (conversationId, recipientUserId). Malformed → mark sent.
//   - Presence re-check: recipient online NOW → cancel (mark sent, no send).
//   - Read short-circuit: recipient last_read_at covers the latest message
//     (no unread) → cancel (mark sent, no send).
//   - Else recompute the digest body from the messages (unread count N + latest
//     preview + sender workspace name) and send THAT (not the stored placeholder),
//     then markResult.
//
// presence + sender are mocked; conversation/messages/read/outbox are real (pglite).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { outboxEntries } from '@/lib/db/schema';
import {
  seedBuyerWorkspace,
  seedMembership,
  seedPgWorkspace,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { setupRfpActionEnv, teardownRfpActionEnv } from '@/lib/server/actions/rfp/__tests__/_setup';
import {
  getChatConversationRepo,
  getChatMessageRepo,
  getChatReadRepo,
} from '@/lib/server/repositories/factory';
import { chatDigestDedupeKey } from '@/lib/server/actions/chat/_shared';
import type { PgliteDB } from '@/lib/db/client-pglite';
import type { Sender } from '../types';

// The import graph (via chat/_shared) pulls @/lib/auth/session → next-auth,
// which is unresolvable in the vitest runner. Stub it; this processor never
// touches the session anyway.
vi.mock('@/lib/auth/session', () => ({
  requireSession: () => Promise.reject(new Error('UNAUTHENTICATED')),
}));

// Presence — defaults offline (don't cancel); flip true for the online test.
const isUserPresentInConversation = vi.fn().mockResolvedValue(false);
vi.mock('@/lib/server/realtime/centrifugo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../realtime/centrifugo')>();
  return {
    ...actual,
    isUserPresentInConversation: (...args: unknown[]) =>
      isUserPresentInConversation(...args),
  };
});

import { flushChatDigests } from '../chat-digest-flush';

let db: PgliteDB;

async function seedScene() {
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

// Insert N messages authored by `authorWsId`/`authorUserId` into a conversation.
async function seedMessages(
  conversationId: string,
  authorUserId: string,
  authorWsId: string,
  bodies: string[],
  start: Date,
) {
  const repo = await getChatMessageRepo();
  let t = start.getTime();
  for (const body of bodies) {
    await repo.save({
      id: randomUUID(),
      conversationId,
      authorUserId,
      authorWsId,
      body,
      rfpId: null,
      createdAt: new Date((t += 1000)),
    });
  }
}

// Seed a DUE chat-digest outbox row (past scheduled_at) for a recipient.
async function seedDueDigest(
  conversationId: string,
  recipientUserId: string,
  to: string,
) {
  const dedupeKey = chatDigestDedupeKey(conversationId, recipientUserId, new Date(0));
  await db.insert(outboxEntries).values({
    event: 'chat.message',
    toAddr: to,
    subject: '[Supporter B] placeholder',
    html: '<a>placeholder</a>',
    dedupeKey,
    scheduledAt: new Date(Date.now() - 1000),
  });
  const [row] = await db
    .select()
    .from(outboxEntries)
    .where(eq(outboxEntries.dedupeKey, dedupeKey));
  return row;
}

describe('flushChatDigests', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
    isUserPresentInConversation.mockClear();
    isUserPresentInConversation.mockResolvedValue(false);
  });
  afterEach(() => {
    teardownRfpActionEnv();
  });

  it('(c) cancels (no send, marks sent) when the recipient has already read everything', async () => {
    const { buyerUser, buyerWs, pgUser, conv } = await seedScene();
    const base = new Date(Date.now() - 60_000);
    await seedMessages(conv.id, buyerUser.id, buyerWs.id, ['m1', 'm2'], base);
    // PG recipient read AFTER the latest message → no unread.
    await (await getChatReadRepo()).upsert(conv.id, pgUser.id, new Date());
    const row = await seedDueDigest(conv.id, pgUser.id, pgUser.email);

    const sender = vi.fn<Sender>().mockResolvedValue({ ok: true });
    await flushChatDigests(sender, 10);

    expect(sender).not.toHaveBeenCalled();
    const [after] = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.id, row.id));
    expect(after.status).toBe('sent');
  });

  it('(d)+(e) sends a recomputed digest with the unread count N, then marks sent', async () => {
    const { buyerUser, buyerWs, pgUser, conv } = await seedScene();
    const base = new Date(Date.now() - 60_000);
    // 3 unread messages from the buyer; PG never read.
    await seedMessages(conv.id, buyerUser.id, buyerWs.id, ['m1', 'm2', '제안 검토 부탁드려요.'], base);
    const row = await seedDueDigest(conv.id, pgUser.id, pgUser.email);

    const sender = vi.fn<Sender>().mockResolvedValue({ ok: true });
    await flushChatDigests(sender, 10);

    expect(sender).toHaveBeenCalledTimes(1);
    const sent = sender.mock.calls[0][0];
    expect(sent.event).toBe('chat.message');
    expect(sent.to).toBe(pgUser.email);
    // Recomputed body — NOT the stored placeholder — carries N=3 + sender name.
    expect(sent.html).not.toContain('placeholder');
    expect(sent.html).toMatch(/3\s*건/);
    expect(sent.html).toContain('구매사'); // sender workspace name

    // (e) the row is marked sent.
    const [after] = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.id, row.id));
    expect(after.status).toBe('sent');
  });

  it('counts only messages newer than a partial-read watermark (lastReadAt boundary)', async () => {
    const { buyerUser, buyerWs, pgUser, conv } = await seedScene();
    const base = new Date(Date.now() - 60_000);
    // seedMessages writes at base+1s, +2s, +3s (t += 1000 before each save).
    await seedMessages(conv.id, buyerUser.id, buyerWs.id, ['m1', 'm2', '최신 메시지'], base);
    // Watermark BETWEEN m1 and m2 → m2, m3 unread → N must be 2 (not 0, not 3).
    await (await getChatReadRepo()).upsert(
      conv.id,
      pgUser.id,
      new Date(base.getTime() + 1500),
    );
    await seedDueDigest(conv.id, pgUser.id, pgUser.email);

    const sender = vi.fn<Sender>().mockResolvedValue({ ok: true });
    await flushChatDigests(sender, 10);

    expect(sender).toHaveBeenCalledTimes(1);
    const sent = sender.mock.calls[0][0];
    expect(sent.html).toMatch(/2\s*건/);
    expect(sent.html).not.toMatch(/3\s*건/);
    expect(sent.html).toContain('최신 메시지'); // preview = latest unread
  });

  it('cancels (no send) when the recipient is online NOW (presence re-check)', async () => {
    const { buyerUser, buyerWs, pgUser, conv } = await seedScene();
    const base = new Date(Date.now() - 60_000);
    await seedMessages(conv.id, buyerUser.id, buyerWs.id, ['m1'], base);
    const row = await seedDueDigest(conv.id, pgUser.id, pgUser.email);
    isUserPresentInConversation.mockResolvedValue(true);

    const sender = vi.fn<Sender>().mockResolvedValue({ ok: true });
    await flushChatDigests(sender, 10);

    expect(sender).not.toHaveBeenCalled();
    const [after] = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.id, row.id));
    expect(after.status).toBe('sent');
  });

  it('marks a malformed-dedupeKey row sent without sending (queue self-heals)', async () => {
    await seedScene();
    await db.insert(outboxEntries).values({
      event: 'chat.message',
      toAddr: 'junk@e.com',
      subject: 'S',
      html: '<a>x</a>',
      dedupeKey: 'not-a-chat-digest-key',
      scheduledAt: new Date(Date.now() - 1000),
    });

    const sender = vi.fn<Sender>().mockResolvedValue({ ok: true });
    await flushChatDigests(sender, 10);

    expect(sender).not.toHaveBeenCalled();
    const [after] = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.dedupeKey, 'not-a-chat-digest-key'));
    expect(after.status).toBe('sent');
  });

  it('excludes the recipient\'s own messages from the unread count', async () => {
    const { buyerUser, buyerWs, pgUser, pgWs, conv } = await seedScene();
    const base = new Date(Date.now() - 60_000);
    // 2 from the buyer (counterparty) + 1 from the PG recipient themselves.
    await seedMessages(conv.id, buyerUser.id, buyerWs.id, ['b1', 'b2'], base);
    await seedMessages(conv.id, pgUser.id, pgWs.id, ['my own reply'], new Date());
    await seedDueDigest(conv.id, pgUser.id, pgUser.email);

    const sender = vi.fn<Sender>().mockResolvedValue({ ok: true });
    await flushChatDigests(sender, 10);

    expect(sender).toHaveBeenCalledTimes(1);
    const sent = sender.mock.calls[0][0];
    // Only the 2 buyer messages count as unread, not the recipient's own.
    expect(sent.html).toMatch(/2\s*건/);
    expect(sent.html).not.toContain('my own reply');
  });

  // ─── ADVERSARIAL: same-side teammate messages must NOT count as unread ───
  // Workspaces are multi-member. The digest body must reflect only COUNTERPARTY
  // messages the recipient hasn't read — a teammate on the recipient's OWN side
  // is not an incoming message. The enqueue fanout already only enqueues a row
  // per *counterparty* member (a teammate's send never enqueues a row for you),
  // so the flush recompute must agree: exclude by SIDE (authorWsId), not just by
  // the recipient's own userId.
  it('(a) does NOT send when every counterparty message is read and only a same-side teammate has posted since', async () => {
    const { buyerUser, buyerWs, pgUser, pgWs, conv } = await seedScene();
    // A second PG teammate (same side as the recipient pgUser).
    const pgUser2 = await seedUser(db, { email: 'sales2@pg.com', name: 'PG영업2' });
    await seedMembership(db, pgWs.id, pgUser2.id, 'member');

    const base = new Date(Date.now() - 60_000);
    // Counterparty (buyer) sends b1 at base+1s.
    await seedMessages(conv.id, buyerUser.id, buyerWs.id, ['b1'], base);
    // Recipient reads everything from the counterparty (watermark after b1).
    await (await getChatReadRepo()).upsert(
      conv.id,
      pgUser.id,
      new Date(base.getTime() + 5_000),
    );
    // THEN a same-side teammate posts t1 (after the read watermark).
    await seedMessages(conv.id, pgUser2.id, pgWs.id, ['t1 팀원 메시지'], new Date());

    await seedDueDigest(conv.id, pgUser.id, pgUser.email);

    const sender = vi.fn<Sender>().mockResolvedValue({ ok: true });
    await flushChatDigests(sender, 10);

    // No counterparty message is unread → the digest must be cancelled, not sent.
    expect(sender).not.toHaveBeenCalled();
  });

  it('(b) counts only counterparty messages, not same-side teammate messages, in N and senderName', async () => {
    const { buyerUser, buyerWs, pgUser, pgWs, conv } = await seedScene();
    const pgUser2 = await seedUser(db, { email: 'sales2@pg.com', name: 'PG영업2' });
    await seedMembership(db, pgWs.id, pgUser2.id, 'member');

    const base = new Date(Date.now() - 60_000);
    // 2 from the counterparty (buyer) + 1 from a same-side teammate.
    await seedMessages(conv.id, buyerUser.id, buyerWs.id, ['b1', 'b2'], base);
    await seedMessages(conv.id, pgUser2.id, pgWs.id, ['teammate msg'], new Date());
    await seedDueDigest(conv.id, pgUser.id, pgUser.email);

    const sender = vi.fn<Sender>().mockResolvedValue({ ok: true });
    await flushChatDigests(sender, 10);

    expect(sender).toHaveBeenCalledTimes(1);
    const sent = sender.mock.calls[0][0];
    // Only the 2 buyer messages are incoming-unread — not the teammate's.
    expect(sent.html).toMatch(/2\s*건/);
    expect(sent.html).not.toMatch(/3\s*건/);
    // senderName must be the COUNTERPARTY workspace (buyer), not the recipient's
    // own PG workspace (which is what authorWsId of the teammate message yields).
    expect(sent.html).toContain('구매사');
    expect(sent.html).not.toContain('teammate msg');
  });
});
