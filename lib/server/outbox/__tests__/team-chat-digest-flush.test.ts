// flushTeamChatDigests — the dedicated processor that drains delayed
// team_chat.message digest rows (enqueued by TeamChatService.sendMessage at the
// window END). Mirrors flushChatDigests but scoped to (rfpId, workspaceId,
// recipientUserId):
//
//   - Parse dedupeKey → (rfpId, workspaceId, recipientUserId). Malformed → mark sent.
//   - Read short-circuit: recipient last_read_at covers every (non-self) team
//     message (no unread) → cancel (mark sent, no send).
//   - Else recompute the digest body from the unread messages (count N + latest
//     preview + author name) and send THAT (not the stored placeholder), then markResult.
//
// batchSender is mocked; rfp team messages / read state / outbox are real (pglite).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { outboxEntries } from '@/lib/db/schema';
import {
  seedBuyerWorkspace,
  seedMembership,
  seedRfp,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { setupRfpActionEnv, teardownRfpActionEnv } from '@/lib/server/actions/rfp/__tests__/_setup';
import { getRfpTeamMessageRepo, getRfpTeamMessageReadRepo } from '@/lib/server/repositories/factory';
import { seedPgWorkspace } from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { teamDigestDedupeKey } from '../team-digest';
import type { PgliteDB } from '@/lib/db/client-pglite';
import type { BatchSender, OutboxEntry } from '../types';

import { flushTeamChatDigests } from '../team-chat-digest-flush';

let db: PgliteDB;

// Seed buyer ws + me (recipient) + mate (author) + rfp.
async function seedScene() {
  const me = await seedUser(db, { email: 'me@b.com', name: '나' });
  const mate = await seedUser(db, { email: 'mate@b.com', name: '동료' });
  const ws = await seedBuyerWorkspace(db, { name: '구매사' });
  await seedMembership(db, ws.id, me.id, 'admin');
  await seedMembership(db, ws.id, mate.id, 'member');
  const rfp = await seedRfp(db, { buyerWsId: ws.id, createdBy: me.id });
  return { me, mate, ws, rfp };
}

// Insert N team messages authored by `authorUserId` into (rfp, ws) scope.
async function seedMessages(
  rfpId: string,
  workspaceId: string,
  authorUserId: string,
  bodies: string[],
  start: Date,
) {
  const repo = await getRfpTeamMessageRepo();
  let t = start.getTime();
  for (const body of bodies) {
    await repo.save({
      id: randomUUID(),
      rfpId,
      workspaceId,
      authorUserId,
      body,
      createdAt: new Date((t += 1000)),
    });
  }
}

// Seed a DUE team-chat-digest outbox row (past scheduled_at) for a recipient.
async function seedDueDigest(
  rfpId: string,
  workspaceId: string,
  recipientUserId: string,
  to: string,
) {
  const dedupeKey = teamDigestDedupeKey(rfpId, workspaceId, recipientUserId, new Date(0));
  await db.insert(outboxEntries).values({
    event: 'team_chat.message',
    toAddr: to,
    subject: '[서포트 B] placeholder',
    html: '<p>placeholder</p>',
    dedupeKey,
    scheduledAt: new Date(Date.now() - 1000),
  });
  const [row] = await db
    .select()
    .from(outboxEntries)
    .where(eq(outboxEntries.dedupeKey, dedupeKey));
  return row;
}

describe('flushTeamChatDigests', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
  });
  afterEach(() => {
    teardownRfpActionEnv();
  });

  it('sends a recomputed digest when the recipient has unread team messages', async () => {
    const { me, mate, ws, rfp } = await seedScene();
    const base = new Date(Date.now() - 60_000);
    await seedMessages(rfp.id, ws.id, mate.id, ['m1', 'm2'], base);
    const row = await seedDueDigest(rfp.id, ws.id, me.id, me.email);

    const batchSender = vi.fn<BatchSender>().mockImplementation(async (es: OutboxEntry[]) => es.map(() => ({ ok: true as const })));
    const result = await flushTeamChatDigests(batchSender, 10);

    expect(result.sent).toBe(1);
    expect(batchSender).toHaveBeenCalledTimes(1);
    const sent = batchSender.mock.calls[0][0][0];
    expect(sent.event).toBe('team_chat.message');
    expect(sent.to).toBe(me.email);
    // Recomputed body — NOT the stored placeholder.
    expect(sent.html).not.toContain('placeholder');
    expect(sent.html).toContain('동료'); // author name

    const [after] = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.id, row.id));
    expect(after.status).toBe('sent');
  });

  it('cancels (no send, marks sent) when the recipient has already read everything', async () => {
    const { me, mate, ws, rfp } = await seedScene();
    const base = new Date(Date.now() - 60_000);
    await seedMessages(rfp.id, ws.id, mate.id, ['m1', 'm2'], base);
    // Recipient read AFTER the latest message → no unread.
    await (await getRfpTeamMessageReadRepo()).upsert(rfp.id, ws.id, me.id, new Date());
    const row = await seedDueDigest(rfp.id, ws.id, me.id, me.email);

    const batchSender = vi.fn<BatchSender>().mockImplementation(async (es: OutboxEntry[]) => es.map(() => ({ ok: true as const })));
    const result = await flushTeamChatDigests(batchSender, 10);

    expect(result.cancelled).toBe(1);
    expect(batchSender).not.toHaveBeenCalled();
    const [after] = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.id, row.id));
    expect(after.status).toBe('sent');
  });

  it('reschedules a failed (retryable) digest with backoff instead of dropping it', async () => {
    const { me, mate, ws, rfp } = await seedScene();
    const base = new Date(Date.now() - 60_000);
    await seedMessages(rfp.id, ws.id, mate.id, ['m1'], base);
    const row = await seedDueDigest(rfp.id, ws.id, me.id, me.email);

    const before = Date.now();
    const batchSender = vi
      .fn<BatchSender>()
      .mockImplementation(async (es: OutboxEntry[]) => es.map(() => ({ ok: false as const, error: 'rate limited', retryable: true })));
    const result = await flushTeamChatDigests(batchSender, 10);

    expect(result.failed).toBe(1);
    const [after] = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.id, row.id));
    expect(after.status).toBe('pending');
    expect(after.attempts).toBe(1);
    expect(new Date(after.scheduledAt).getTime()).toBeGreaterThan(before);
  });

  it('marks a malformed-dedupeKey row sent without sending (queue self-heals)', async () => {
    await seedScene();
    await db.insert(outboxEntries).values({
      event: 'team_chat.message',
      toAddr: 'junk@e.com',
      subject: 'S',
      html: '<p>x</p>',
      dedupeKey: 'not-a-team-digest-key',
      scheduledAt: new Date(Date.now() - 1000),
    });

    const batchSender = vi.fn<BatchSender>().mockImplementation(async (es: OutboxEntry[]) => es.map(() => ({ ok: true as const })));
    const result = await flushTeamChatDigests(batchSender, 10);

    expect(result.cancelled).toBe(1);
    expect(batchSender).not.toHaveBeenCalled();
    const [after] = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.dedupeKey, 'not-a-team-digest-key'));
    expect(after.status).toBe('sent');
  });

  it("excludes the recipient's own messages from the unread count", async () => {
    const { me, mate, ws, rfp } = await seedScene();
    const base = new Date(Date.now() - 60_000);
    // 2 from the teammate + 1 from the recipient themselves.
    await seedMessages(rfp.id, ws.id, mate.id, ['t1', 't2'], base);
    await seedMessages(rfp.id, ws.id, me.id, ['my own note'], new Date());
    await seedDueDigest(rfp.id, ws.id, me.id, me.email);

    const batchSender = vi.fn<BatchSender>().mockImplementation(async (es: OutboxEntry[]) => es.map(() => ({ ok: true as const })));
    await flushTeamChatDigests(batchSender, 10);

    expect(batchSender).toHaveBeenCalledTimes(1);
    const sent = batchSender.mock.calls[0][0][0];
    expect(sent.html).toMatch(/2\s*건/);
    expect(sent.html).not.toContain('my own note');
  });

  it('digest 이메일 본문/프리뷰에서 멘션 토큰을 @이름 평문으로 렌더한다', async () => {
    const { me, mate, ws, rfp } = await seedScene();
    const base = new Date(Date.now() - 60_000);
    await seedMessages(rfp.id, ws.id, mate.id, [`<@${me.id}> 확인`], base);
    await seedDueDigest(rfp.id, ws.id, me.id, me.email);

    const captured: { subject: string; html: string }[] = [];
    const batchSender = vi.fn<BatchSender>().mockImplementation(async (es: OutboxEntry[]) => {
      for (const e of es) captured.push({ subject: e.subject, html: e.html });
      return es.map(() => ({ ok: true as const }));
    });
    const result = await flushTeamChatDigests(batchSender, 10);

    expect(result.sent).toBe(1);
    expect(captured[0].html).not.toContain('<@');
    expect(captured[0].html).toContain('@나');
  });

  it('counts only messages newer than a partial-read watermark (lastReadAt boundary)', async () => {
    const { me, mate, ws, rfp } = await seedScene();
    const base = new Date(Date.now() - 60_000);
    // Three messages: t+1s, t+2s, t+3s.
    await seedMessages(rfp.id, ws.id, mate.id, ['early', 'mid', 'latest'], base);
    // Watermark BETWEEN early and mid → mid+latest unread (N=2).
    await (await getRfpTeamMessageReadRepo()).upsert(rfp.id, ws.id, me.id, new Date(base.getTime() + 1500));
    await seedDueDigest(rfp.id, ws.id, me.id, me.email);

    const batchSender = vi.fn<BatchSender>().mockImplementation(async (es: OutboxEntry[]) => es.map(() => ({ ok: true as const })));
    await flushTeamChatDigests(batchSender, 10);

    expect(batchSender).toHaveBeenCalledTimes(1);
    const sent = batchSender.mock.calls[0][0][0];
    expect(sent.html).toMatch(/2\s*건/);
    expect(sent.html).not.toMatch(/3\s*건/);
    expect(sent.html).toContain('latest');
  });

  it('falls back to EMPTY_PREVIEW text when the latest team message body is empty', async () => {
    const { me, mate, ws, rfp } = await seedScene();
    const base = new Date(Date.now() - 60_000);
    await seedMessages(rfp.id, ws.id, mate.id, [''], base);
    await seedDueDigest(rfp.id, ws.id, me.id, me.email);

    const batchSender = vi.fn<BatchSender>().mockImplementation(async (es: OutboxEntry[]) => es.map(() => ({ ok: true as const })));
    await flushTeamChatDigests(batchSender, 10);

    expect(batchSender).toHaveBeenCalledTimes(1);
    const sent = batchSender.mock.calls[0][0][0];
    expect(sent.html).toContain('첨부 파일');
  });

  it('uses singular subject format when there is only 1 unread team message', async () => {
    const { me, mate, ws, rfp } = await seedScene();
    const base = new Date(Date.now() - 60_000);
    await seedMessages(rfp.id, ws.id, mate.id, ['단건'], base);
    await seedDueDigest(rfp.id, ws.id, me.id, me.email);

    const batchSender = vi.fn<BatchSender>().mockImplementation(async (es: OutboxEntry[]) => es.map(() => ({ ok: true as const })));
    await flushTeamChatDigests(batchSender, 10);

    const sent = batchSender.mock.calls[0][0][0];
    expect(sent.subject).not.toMatch(/\d+건/);
    expect(sent.subject).toContain('동료');
  });

  it("falls back to '팀원' senderName when the author has an empty display name", async () => {
    const noNameUser = await seedUser(db, { email: 'noname@b.com', name: '' });
    const { me, ws, rfp } = await seedScene();
    await seedMembership(db, ws.id, noNameUser.id, 'member');
    const base = new Date(Date.now() - 60_000);
    await seedMessages(rfp.id, ws.id, noNameUser.id, ['익명 메시지'], base);
    await seedDueDigest(rfp.id, ws.id, me.id, me.email);

    const batchSender = vi.fn<BatchSender>().mockImplementation(async (es: OutboxEntry[]) => es.map(() => ({ ok: true as const })));
    await flushTeamChatDigests(batchSender, 10);

    expect(batchSender).toHaveBeenCalledTimes(1);
    const sent = batchSender.mock.calls[0][0][0];
    expect(sent.html).toContain('팀원');
  });

  it('permanently fails (no reschedule) when retryable is false', async () => {
    const { me, mate, ws, rfp } = await seedScene();
    const base = new Date(Date.now() - 60_000);
    await seedMessages(rfp.id, ws.id, mate.id, ['m1'], base);
    const row = await seedDueDigest(rfp.id, ws.id, me.id, me.email);

    const originalScheduledAt = new Date(row.scheduledAt).getTime();
    const batchSender = vi
      .fn<BatchSender>()
      .mockImplementation(async (es: OutboxEntry[]) => es.map(() => ({ ok: false as const, error: 'invalid email', retryable: false })));
    const result = await flushTeamChatDigests(batchSender, 10);

    expect(result.failed).toBe(1);
    const [after] = await db.select().from(outboxEntries).where(eq(outboxEntries.id, row.id));
    // Permanently failed: status must be 'failed' (markResult retryable:false sets it unconditionally).
    expect(after.status).toBe('failed');
    expect(after.attempts).toBe(1);
    expect(new Date(after.scheduledAt).getTime()).toBe(originalScheduledAt);
  });

  it('reschedules (with backoff) when retryable is omitted (undefined)', async () => {
    const { me, mate, ws, rfp } = await seedScene();
    const base = new Date(Date.now() - 60_000);
    await seedMessages(rfp.id, ws.id, mate.id, ['m1'], base);
    const row = await seedDueDigest(rfp.id, ws.id, me.id, me.email);

    const before = Date.now();
    const batchSender = vi
      .fn<BatchSender>()
      .mockImplementation(async (es: OutboxEntry[]) =>
        es.map(() => ({ ok: false as const, error: 'transient error' })),
      );
    const result = await flushTeamChatDigests(batchSender, 10);

    expect(result.failed).toBe(1);
    const [after] = await db.select().from(outboxEntries).where(eq(outboxEntries.id, row.id));
    expect(after.status).toBe('pending');
    expect(new Date(after.scheduledAt).getTime()).toBeGreaterThan(before);
  });

  it('PG workspace team digest uses the partner host URL', async () => {
    const savedBuyer = process.env.NEXT_PUBLIC_BUYER_ORIGIN;
    const savedPartner = process.env.NEXT_PUBLIC_PARTNER_ORIGIN;
    process.env.NEXT_PUBLIC_BUYER_ORIGIN = 'https://support-b.com';
    process.env.NEXT_PUBLIC_PARTNER_ORIGIN = 'https://partner.support-b.com';
    try {
      const pgUser1 = await seedUser(db, { email: 'pg1@pg.com', name: 'PG담당' });
      const pgUser2 = await seedUser(db, { email: 'pg2@pg.com', name: 'PG동료' });
      const pgWs = await seedPgWorkspace(db, 'PGurl', { name: 'OO페이' });
      await seedMembership(db, pgWs.id, pgUser1.id, 'admin');
      await seedMembership(db, pgWs.id, pgUser2.id, 'member');
      // Create a real RFP so FK constraint is satisfied.
      const buyerUser = await seedUser(db, { email: 'byr@b.com', name: '구매사' });
      const buyerWs = await seedBuyerWorkspace(db, { name: '구매사X' });
      await seedMembership(db, buyerWs.id, buyerUser.id, 'admin');
      const rfp = await seedRfp(db, { buyerWsId: buyerWs.id, createdBy: buyerUser.id });

      await seedMessages(rfp.id, pgWs.id, pgUser2.id, ['PG팀 공지'], new Date(Date.now() - 60_000));
      await seedDueDigest(rfp.id, pgWs.id, pgUser1.id, pgUser1.email);

      const batchSender = vi.fn<BatchSender>().mockImplementation(async (es: OutboxEntry[]) => es.map(() => ({ ok: true as const })));
      await flushTeamChatDigests(batchSender, 10);

      expect(batchSender).toHaveBeenCalledTimes(1);
      const sent = batchSender.mock.calls[0][0][0];
      expect(sent.html).toContain('partner.support-b.com');
      expect(sent.html).not.toContain('https://support-b.com/messages');
    } finally {
      if (savedBuyer === undefined) delete process.env.NEXT_PUBLIC_BUYER_ORIGIN;
      else process.env.NEXT_PUBLIC_BUYER_ORIGIN = savedBuyer;
      if (savedPartner === undefined) delete process.env.NEXT_PUBLIC_PARTNER_ORIGIN;
      else process.env.NEXT_PUBLIC_PARTNER_ORIGIN = savedPartner;
    }
  });

  it('multiple due team digest entries are all sent in a single batch call', async () => {
    // Two recipients in the same workspace (me + mate) — each gets a digest row.
    const { me, mate, ws, rfp } = await seedScene();
    const base = new Date(Date.now() - 60_000);
    // mate sends messages → me has unread; me sends messages → mate has unread.
    await seedMessages(rfp.id, ws.id, mate.id, ['mate→me'], base);
    await seedMessages(rfp.id, ws.id, me.id, ['me→mate'], base);
    await seedDueDigest(rfp.id, ws.id, me.id, me.email);
    await seedDueDigest(rfp.id, ws.id, mate.id, mate.email);

    const batchSender = vi.fn<BatchSender>().mockImplementation(async (es: OutboxEntry[]) => es.map(() => ({ ok: true as const })));
    const result = await flushTeamChatDigests(batchSender, 10);

    expect(result.sent).toBe(2);
    // Both entries sent in ONE batch call — not two individual calls.
    expect(batchSender).toHaveBeenCalledTimes(1);
    expect(batchSender.mock.calls[0][0]).toHaveLength(2);
    // Each enriched entry must carry the correct per-recipient address.
    const [e0, e1] = batchSender.mock.calls[0][0];
    const recipients = [e0.to, e1.to].sort();
    expect(recipients).toEqual([me.email, mate.email].sort());
  });
});
