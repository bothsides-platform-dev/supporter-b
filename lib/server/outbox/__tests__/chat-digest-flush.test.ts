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
// presence + batchSender are mocked; conversation/messages/read/outbox are real (pglite).
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
import type { BatchSender, OutboxEntry } from '../types';

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

    const batchSender = vi.fn<BatchSender>().mockImplementation(async (es: OutboxEntry[]) => es.map(() => ({ ok: true as const })));
    await flushChatDigests(batchSender, 10);

    expect(batchSender).not.toHaveBeenCalled();
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

    const batchSender = vi.fn<BatchSender>().mockImplementation(async (es: OutboxEntry[]) => es.map(() => ({ ok: true as const })));
    await flushChatDigests(batchSender, 10);

    expect(batchSender).toHaveBeenCalledTimes(1);
    const sent = batchSender.mock.calls[0][0][0];
    expect(sent.event).toBe('chat.message');
    expect(sent.to).toBe(pgUser.email);
    // Recomputed body — NOT the stored placeholder — carries N=3 + sender name.
    expect(sent.html).not.toContain('placeholder');
    expect(sent.html).toMatch(/3\s*건/);
    expect(sent.html).toContain('구매사'); // sender workspace name
    // Recomputed subject — not the stored placeholder.
    expect(sent.subject).not.toContain('placeholder');
    expect(sent.subject).toContain('구매사');

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

    const batchSender = vi.fn<BatchSender>().mockImplementation(async (es: OutboxEntry[]) => es.map(() => ({ ok: true as const })));
    await flushChatDigests(batchSender, 10);

    expect(batchSender).toHaveBeenCalledTimes(1);
    const sent = batchSender.mock.calls[0][0][0];
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

    const batchSender = vi.fn<BatchSender>().mockImplementation(async (es: OutboxEntry[]) => es.map(() => ({ ok: true as const })));
    await flushChatDigests(batchSender, 10);

    expect(batchSender).not.toHaveBeenCalled();
    const [after] = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.id, row.id));
    expect(after.status).toBe('sent');
  });

  it('reschedules a failed (retryable) digest with backoff instead of dropping it', async () => {
    const { buyerUser, buyerWs, pgUser, conv } = await seedScene();
    const base = new Date(Date.now() - 60_000);
    await seedMessages(conv.id, buyerUser.id, buyerWs.id, ['m1'], base);
    const row = await seedDueDigest(conv.id, pgUser.id, pgUser.email);

    const before = Date.now();
    const batchSender = vi
      .fn<BatchSender>()
      .mockImplementation(async (es: OutboxEntry[]) => es.map(() => ({ ok: false as const, error: 'rate limited', retryable: true })));
    const result = await flushChatDigests(batchSender, 10);

    expect(result.failed).toBe(1);
    const [after] = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.id, row.id));
    // Still pending (will retry), attempts bumped, and rescheduled into the
    // future by the backoff — not left at its original past scheduled_at.
    expect(after.status).toBe('pending');
    expect(after.attempts).toBe(1);
    expect(new Date(after.scheduledAt).getTime()).toBeGreaterThan(before);
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

    const batchSender = vi.fn<BatchSender>().mockImplementation(async (es: OutboxEntry[]) => es.map(() => ({ ok: true as const })));
    await flushChatDigests(batchSender, 10);

    expect(batchSender).not.toHaveBeenCalled();
    const [after] = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.dedupeKey, 'not-a-chat-digest-key'));
    expect(after.status).toBe('sent');
  });

  it("excludes the recipient's own messages from the unread count", async () => {
    const { buyerUser, buyerWs, pgUser, pgWs, conv } = await seedScene();
    const base = new Date(Date.now() - 60_000);
    // 2 from the buyer (counterparty) + 1 from the PG recipient themselves.
    await seedMessages(conv.id, buyerUser.id, buyerWs.id, ['b1', 'b2'], base);
    await seedMessages(conv.id, pgUser.id, pgWs.id, ['my own reply'], new Date());
    await seedDueDigest(conv.id, pgUser.id, pgUser.email);

    const batchSender = vi.fn<BatchSender>().mockImplementation(async (es: OutboxEntry[]) => es.map(() => ({ ok: true as const })));
    await flushChatDigests(batchSender, 10);

    expect(batchSender).toHaveBeenCalledTimes(1);
    const sent = batchSender.mock.calls[0][0][0];
    // Only the 2 buyer messages count as unread, not the recipient's own.
    expect(sent.html).toMatch(/2\s*건/);
    expect(sent.html).not.toContain('my own reply');
  });

  // ─── ADVERSARIAL: same-side teammate messages must NOT count as unread ───
  it('(a) does NOT send when every counterparty message is read and only a same-side teammate has posted since', async () => {
    const { buyerUser, buyerWs, pgUser, pgWs, conv } = await seedScene();
    const pgUser2 = await seedUser(db, { email: 'sales2@pg.com', name: 'PG영업2' });
    await seedMembership(db, pgWs.id, pgUser2.id, 'member');

    const base = new Date(Date.now() - 60_000);
    await seedMessages(conv.id, buyerUser.id, buyerWs.id, ['b1'], base);
    await (await getChatReadRepo()).upsert(
      conv.id,
      pgUser.id,
      new Date(base.getTime() + 5_000),
    );
    await seedMessages(conv.id, pgUser2.id, pgWs.id, ['t1 팀원 메시지'], new Date());

    await seedDueDigest(conv.id, pgUser.id, pgUser.email);

    const batchSender = vi.fn<BatchSender>().mockImplementation(async (es: OutboxEntry[]) => es.map(() => ({ ok: true as const })));
    await flushChatDigests(batchSender, 10);

    expect(batchSender).not.toHaveBeenCalled();
  });

  it('(b) counts only counterparty messages, not same-side teammate messages, in N and senderName', async () => {
    const { buyerUser, buyerWs, pgUser, pgWs, conv } = await seedScene();
    const pgUser2 = await seedUser(db, { email: 'sales2@pg.com', name: 'PG영업2' });
    await seedMembership(db, pgWs.id, pgUser2.id, 'member');

    const base = new Date(Date.now() - 60_000);
    await seedMessages(conv.id, buyerUser.id, buyerWs.id, ['b1', 'b2'], base);
    await seedMessages(conv.id, pgUser2.id, pgWs.id, ['teammate msg'], new Date());
    await seedDueDigest(conv.id, pgUser.id, pgUser.email);

    const batchSender = vi.fn<BatchSender>().mockImplementation(async (es: OutboxEntry[]) => es.map(() => ({ ok: true as const })));
    await flushChatDigests(batchSender, 10);

    expect(batchSender).toHaveBeenCalledTimes(1);
    const sent = batchSender.mock.calls[0][0][0];
    expect(sent.html).toMatch(/2\s*건/);
    expect(sent.html).not.toMatch(/3\s*건/);
    expect(sent.html).toContain('구매사');
    expect(sent.html).not.toContain('teammate msg');
  });

  it('PG recipient digest email uses the partner host conversationUrl', async () => {
    const savedBuyer = process.env.NEXT_PUBLIC_BUYER_ORIGIN;
    const savedPartner = process.env.NEXT_PUBLIC_PARTNER_ORIGIN;
    process.env.NEXT_PUBLIC_BUYER_ORIGIN = 'https://supporter-b.com';
    process.env.NEXT_PUBLIC_PARTNER_ORIGIN = 'https://partner.supporter-b.com';
    try {
      const { buyerUser, buyerWs, pgUser, conv } = await seedScene();
      const base = new Date(Date.now() - 60_000);
      await seedMessages(conv.id, buyerUser.id, buyerWs.id, ['안녕하세요'], base);
      await seedDueDigest(conv.id, pgUser.id, pgUser.email);

      const batchSender = vi.fn<BatchSender>().mockImplementation(async (es: OutboxEntry[]) => es.map(() => ({ ok: true as const })));
      await flushChatDigests(batchSender, 10);

      expect(batchSender).toHaveBeenCalledTimes(1);
      const sent = batchSender.mock.calls[0][0][0];
      expect(sent.html).toContain('https://partner.supporter-b.com/messages');
      expect(sent.html).not.toContain('https://supporter-b.com/messages');
    } finally {
      if (savedBuyer === undefined) delete process.env.NEXT_PUBLIC_BUYER_ORIGIN;
      else process.env.NEXT_PUBLIC_BUYER_ORIGIN = savedBuyer;
      if (savedPartner === undefined) delete process.env.NEXT_PUBLIC_PARTNER_ORIGIN;
      else process.env.NEXT_PUBLIC_PARTNER_ORIGIN = savedPartner;
    }
  });

  it('buyer recipient digest email uses the buyer host conversationUrl', async () => {
    const savedBuyer = process.env.NEXT_PUBLIC_BUYER_ORIGIN;
    const savedPartner = process.env.NEXT_PUBLIC_PARTNER_ORIGIN;
    process.env.NEXT_PUBLIC_BUYER_ORIGIN = 'https://supporter-b.com';
    process.env.NEXT_PUBLIC_PARTNER_ORIGIN = 'https://partner.supporter-b.com';
    try {
      const { buyerUser, pgUser, pgWs, conv } = await seedScene();
      const base = new Date(Date.now() - 60_000);
      await seedMessages(conv.id, pgUser.id, pgWs.id, ['견적서 보내드립니다'], base);
      await seedDueDigest(conv.id, buyerUser.id, buyerUser.email);

      const batchSender = vi.fn<BatchSender>().mockImplementation(async (es: OutboxEntry[]) => es.map(() => ({ ok: true as const })));
      await flushChatDigests(batchSender, 10);

      expect(batchSender).toHaveBeenCalledTimes(1);
      const sent = batchSender.mock.calls[0][0][0];
      expect(sent.html).toContain('https://supporter-b.com/messages');
      expect(sent.html).not.toContain('https://partner.supporter-b.com/messages');
    } finally {
      if (savedBuyer === undefined) delete process.env.NEXT_PUBLIC_BUYER_ORIGIN;
      else process.env.NEXT_PUBLIC_BUYER_ORIGIN = savedBuyer;
      if (savedPartner === undefined) delete process.env.NEXT_PUBLIC_PARTNER_ORIGIN;
      else process.env.NEXT_PUBLIC_PARTNER_ORIGIN = savedPartner;
    }
  });

  it('cancels (no send, marks sent) when the conversation no longer exists', async () => {
    // Seed a dedupeKey referencing a conversation UUID that was never created.
    const fakeConvId = randomUUID();
    const fakeUserId = randomUUID();
    const dedupeKey = chatDigestDedupeKey(fakeConvId, fakeUserId, new Date(0));
    await db.insert(outboxEntries).values({
      event: 'chat.message',
      toAddr: 'ghost@e.com',
      subject: 'S',
      html: '<p>x</p>',
      dedupeKey,
      scheduledAt: new Date(Date.now() - 1000),
    });

    const batchSender = vi.fn<BatchSender>().mockImplementation(async (es: OutboxEntry[]) => es.map(() => ({ ok: true as const })));
    const result = await flushChatDigests(batchSender, 10);

    expect(result.cancelled).toBe(1);
    expect(batchSender).not.toHaveBeenCalled();
    const [after] = await db.select().from(outboxEntries).where(eq(outboxEntries.dedupeKey, dedupeKey));
    expect(after.status).toBe('sent');
  });

  it('falls back to EMPTY_PREVIEW text when the latest message body is empty', async () => {
    const { buyerUser, buyerWs, pgUser, conv } = await seedScene();
    const base = new Date(Date.now() - 60_000);
    // Message with empty body (e.g. attachment-only).
    await seedMessages(conv.id, buyerUser.id, buyerWs.id, [''], base);
    await seedDueDigest(conv.id, pgUser.id, pgUser.email);

    const batchSender = vi.fn<BatchSender>().mockImplementation(async (es: OutboxEntry[]) => es.map(() => ({ ok: true as const })));
    await flushChatDigests(batchSender, 10);

    expect(batchSender).toHaveBeenCalledTimes(1);
    const sent = batchSender.mock.calls[0][0][0];
    expect(sent.html).toContain('첨부 파일을 보냈어요');
  });

  it('uses singular subject format when there is only 1 unread message', async () => {
    const { buyerUser, buyerWs, pgUser, conv } = await seedScene();
    const base = new Date(Date.now() - 60_000);
    await seedMessages(conv.id, buyerUser.id, buyerWs.id, ['단건 메시지'], base);
    await seedDueDigest(conv.id, pgUser.id, pgUser.email);

    const batchSender = vi.fn<BatchSender>().mockImplementation(async (es: OutboxEntry[]) => es.map(() => ({ ok: true as const })));
    await flushChatDigests(batchSender, 10);

    const sent = batchSender.mock.calls[0][0][0];
    // Singular: "[Sender]님의 새 메시지" — no count N in the title.
    expect(sent.subject).not.toMatch(/\d+건/);
    expect(sent.subject).toContain('구매사');
  });

  it('permanently fails (no reschedule) when retryable is false', async () => {
    const { buyerUser, buyerWs, pgUser, conv } = await seedScene();
    const base = new Date(Date.now() - 60_000);
    await seedMessages(conv.id, buyerUser.id, buyerWs.id, ['m1'], base);
    const row = await seedDueDigest(conv.id, pgUser.id, pgUser.email);

    const originalScheduledAt = new Date(row.scheduledAt).getTime();
    const batchSender = vi
      .fn<BatchSender>()
      .mockImplementation(async (es: OutboxEntry[]) => es.map(() => ({ ok: false as const, error: 'invalid email', retryable: false })));
    const result = await flushChatDigests(batchSender, 10);

    expect(result.failed).toBe(1);
    const [after] = await db.select().from(outboxEntries).where(eq(outboxEntries.id, row.id));
    // Permanently failed: status must be 'failed' (markResult retryable:false sets it unconditionally).
    expect(after.status).toBe('failed');
    expect(after.attempts).toBe(1);
    // nextScheduledAt was undefined → markResult keeps old value (won't advance to future).
    expect(new Date(after.scheduledAt).getTime()).toBe(originalScheduledAt);
  });

  it('reschedules (with backoff) when retryable is omitted (undefined)', async () => {
    const { buyerUser, buyerWs, pgUser, conv } = await seedScene();
    const base = new Date(Date.now() - 60_000);
    await seedMessages(conv.id, buyerUser.id, buyerWs.id, ['m1'], base);
    const row = await seedDueDigest(conv.id, pgUser.id, pgUser.email);

    const before = Date.now();
    const batchSender = vi
      .fn<BatchSender>()
      .mockImplementation(async (es: OutboxEntry[]) =>
        // omit retryable entirely (matches `{ ok: false }` union variant)
        es.map(() => ({ ok: false as const, error: 'transient error' })),
      );
    const result = await flushChatDigests(batchSender, 10);

    expect(result.failed).toBe(1);
    const [after] = await db.select().from(outboxEntries).where(eq(outboxEntries.id, row.id));
    expect(after.status).toBe('pending');
    expect(new Date(after.scheduledAt).getTime()).toBeGreaterThan(before);
  });

  it('multiple due digest entries are all sent in a single batch call', async () => {
    // Two separate conversations → two recipients → two due digest rows.
    const buyerUser1 = await seedUser(db, { email: 'buyer1@b.com', name: '구매사1' });
    const buyerWs1 = await seedBuyerWorkspace(db, { name: '구매사A' });
    await seedMembership(db, buyerWs1.id, buyerUser1.id, 'admin');
    const pgUser1 = await seedUser(db, { email: 'pg1@pg.com', name: 'PG1' });
    const pgWs1 = await seedPgWorkspace(db, 'PG1', { name: 'OO페이1' });
    await seedMembership(db, pgWs1.id, pgUser1.id, 'admin');
    const conv1 = await (await getChatConversationRepo()).findOrCreatePair(buyerWs1.id, pgWs1.id);

    const buyerUser2 = await seedUser(db, { email: 'buyer2@b.com', name: '구매사2' });
    const buyerWs2 = await seedBuyerWorkspace(db, { name: '구매사B' });
    await seedMembership(db, buyerWs2.id, buyerUser2.id, 'admin');
    const pgUser2 = await seedUser(db, { email: 'pg2@pg.com', name: 'PG2' });
    const pgWs2 = await seedPgWorkspace(db, 'PG2', { name: 'OO페이2' });
    await seedMembership(db, pgWs2.id, pgUser2.id, 'admin');
    const conv2 = await (await getChatConversationRepo()).findOrCreatePair(buyerWs2.id, pgWs2.id);

    const base = new Date(Date.now() - 60_000);
    await seedMessages(conv1.id, buyerUser1.id, buyerWs1.id, ['메시지A'], base);
    await seedMessages(conv2.id, buyerUser2.id, buyerWs2.id, ['메시지B'], base);
    await seedDueDigest(conv1.id, pgUser1.id, pgUser1.email);
    await seedDueDigest(conv2.id, pgUser2.id, pgUser2.email);

    const batchSender = vi.fn<BatchSender>().mockImplementation(async (es: OutboxEntry[]) => es.map(() => ({ ok: true as const })));
    const result = await flushChatDigests(batchSender, 10);

    expect(result.sent).toBe(2);
    // Both entries sent in ONE batch call — not two individual calls.
    expect(batchSender).toHaveBeenCalledTimes(1);
    expect(batchSender.mock.calls[0][0]).toHaveLength(2);
    // Each enriched entry must carry the correct per-recipient address.
    const [e0, e1] = batchSender.mock.calls[0][0];
    const recipients = [e0.to, e1.to].sort();
    expect(recipients).toEqual([pgUser1.email, pgUser2.email].sort());
  });
});
