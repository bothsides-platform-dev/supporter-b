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
// sender is mocked; rfp team messages / read state / outbox are real (pglite).
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
import { teamDigestDedupeKey } from '../team-digest';
import type { PgliteDB } from '@/lib/db/client-pglite';
import type { Sender } from '../types';

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
    subject: '[Supporter B] placeholder',
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

    const sender = vi.fn<Sender>().mockResolvedValue({ ok: true });
    const result = await flushTeamChatDigests(sender, 10);

    expect(result.sent).toBe(1);
    expect(sender).toHaveBeenCalledTimes(1);
    const sent = sender.mock.calls[0][0];
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

    const sender = vi.fn<Sender>().mockResolvedValue({ ok: true });
    const result = await flushTeamChatDigests(sender, 10);

    expect(result.cancelled).toBe(1);
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
      event: 'team_chat.message',
      toAddr: 'junk@e.com',
      subject: 'S',
      html: '<p>x</p>',
      dedupeKey: 'not-a-team-digest-key',
      scheduledAt: new Date(Date.now() - 1000),
    });

    const sender = vi.fn<Sender>().mockResolvedValue({ ok: true });
    const result = await flushTeamChatDigests(sender, 10);

    expect(result.cancelled).toBe(1);
    expect(sender).not.toHaveBeenCalled();
    const [after] = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.dedupeKey, 'not-a-team-digest-key'));
    expect(after.status).toBe('sent');
  });

  it('excludes the recipient\'s own messages from the unread count', async () => {
    const { me, mate, ws, rfp } = await seedScene();
    const base = new Date(Date.now() - 60_000);
    // 2 from the teammate + 1 from the recipient themselves.
    await seedMessages(rfp.id, ws.id, mate.id, ['t1', 't2'], base);
    await seedMessages(rfp.id, ws.id, me.id, ['my own note'], new Date());
    await seedDueDigest(rfp.id, ws.id, me.id, me.email);

    const sender = vi.fn<Sender>().mockResolvedValue({ ok: true });
    await flushTeamChatDigests(sender, 10);

    expect(sender).toHaveBeenCalledTimes(1);
    const sent = sender.mock.calls[0][0];
    expect(sent.html).toMatch(/2\s*건/);
    expect(sent.html).not.toContain('my own note');
  });

  it('digest 이메일 본문/프리뷰에서 멘션 토큰을 @이름 평문으로 렌더한다', async () => {
    const { me, mate, ws, rfp } = await seedScene();
    const base = new Date(Date.now() - 60_000);
    await seedMessages(rfp.id, ws.id, mate.id, [`<@${me.id}> 확인`], base);
    await seedDueDigest(rfp.id, ws.id, me.id, me.email);

    const captured: { subject: string; html: string }[] = [];
    const sender = vi.fn<Sender>().mockImplementation(async (e) => {
      captured.push({ subject: e.subject, html: e.html });
      return { ok: true };
    });
    const result = await flushTeamChatDigests(sender, 10);

    expect(result.sent).toBe(1);
    expect(captured[0].html).not.toContain('<@');
    expect(captured[0].html).toContain('@나');
  });
});
