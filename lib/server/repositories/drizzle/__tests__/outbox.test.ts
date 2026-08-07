// DrizzleOutboxRepository contract — pglite-backed.
//
// PGLite caveat (single in-process backend): `Promise.all([flush(), flush()])`
// serialises at the driver, so we cannot empirically demonstrate the SKIP
// LOCKED contention path under pglite. The clause still parses and emits;
// real concurrency proofs live in the integration suite against postgres-js.
// Here we assert the **observable contract** under serial execution: rows
// drained once, no duplicate sender calls across flushes, dedupeKey unique,
// and maxAttempts → 'failed' transition matches the in-memory adapter test.

import { describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';

import { createPgliteDb } from '@/lib/db/client-pglite';
import { outboxEntries } from '@/lib/db/schema';
import { DrizzleOutboxRepository } from '../outbox';
import type { BatchSender } from '@/lib/server/outbox/types';

async function setup() {
  const db = await createPgliteDb();
  const repo = new DrizzleOutboxRepository(db);
  return { db, repo };
}

// Inspect a row regardless of its scheduled_at lease — `repo.pending()` only
// returns ready rows. Tests that want to assert state of leased-but-not-yet-
// retried rows go through this.
async function readAll(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
): Promise<{ id: string; status: string; attempts: number }[]> {
  return await db
    .select({
      id: outboxEntries.id,
      status: outboxEntries.status,
      attempts: outboxEntries.attempts,
    })
    .from(outboxEntries)
    .orderBy(outboxEntries.scheduledAt);
}

void sql; // imported for future raw-SQL tests; keep usage minimal here.

// BatchSender stubs — flush now drains claimed rows through Resend's batch API
// (one call per <=100-row chunk) instead of one call per row.
const okBatch: BatchSender = async (entries) => entries.map(() => ({ ok: true }));

describe('DrizzleOutboxRepository / Step 10', () => {
  it('enqueue dedupes by dedupeKey (partial unique index)', async () => {
    const { repo } = await setup();
    const dedupeKey = 'rfp:P-2605-0042:invite:pg@toss.im';
    const first = await repo.enqueue({
      event: 'rfp.invited',
      to: 'pg@toss.im',
      subject: 'S',
      html: '<a>x</a>',
      dedupeKey,
    });
    const second = await repo.enqueue({
      event: 'rfp.invited',
      to: 'pg@toss.im',
      subject: 'S',
      html: '<a>x</a>',
      dedupeKey,
    });
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    const pending = await repo.pending(10);
    expect(pending).toHaveLength(1);
  });

  // Batch enqueue — notify() fans out to every recipient of a workspace and
  // used to issue one INSERT per address inside the open transaction.
  describe('enqueueMany', () => {
    const mk = (to: string, dedupeKey?: string) => ({
      event: 'rfp.invited' as const,
      to,
      subject: 'S',
      html: '<a>x</a>',
      ...(dedupeKey ? { dedupeKey } : {}),
    });

    it('inserts one row per recipient', async () => {
      const { repo } = await setup();

      await repo.enqueueMany([mk('a@x.com'), mk('b@x.com'), mk('c@x.com')]);

      const pending = await repo.pending(10);
      expect(pending.map((p) => p.to).sort()).toEqual(['a@x.com', 'b@x.com', 'c@x.com']);
    });

    it('skips a dedupeKey that already exists, keeping the rest', async () => {
      const { repo } = await setup();
      await repo.enqueue(mk('a@x.com', 'k:a'));

      await repo.enqueueMany([mk('a@x.com', 'k:a'), mk('b@x.com', 'k:b')]);

      const pending = await repo.pending(10);
      expect(pending).toHaveLength(2);
      expect(pending.map((p) => p.to).sort()).toEqual(['a@x.com', 'b@x.com']);
    });

    // ON CONFLICT arbitrates against committed rows; two rows carrying the same
    // key inside ONE statement are not reliably deduped by it. If this ever
    // regresses the dedupe guarantee silently weakens for batched fan-out.
    it('collapses duplicate dedupeKeys that appear within the same batch', async () => {
      const { repo } = await setup();

      await repo.enqueueMany([mk('a@x.com', 'same'), mk('b@x.com', 'same')]);

      const pending = await repo.pending(10);
      expect(pending).toHaveLength(1);
    });

    it('still inserts every row when dedupeKey is absent (null is not a conflict)', async () => {
      const { repo } = await setup();

      await repo.enqueueMany([mk('a@x.com'), mk('a@x.com')]);

      expect(await repo.pending(10)).toHaveLength(2);
    });

    it('is a no-op for an empty list', async () => {
      const { repo } = await setup();
      await repo.enqueueMany([]);
      expect(await repo.pending(10)).toHaveLength(0);
    });

    // Chat/team digests coalesce by scheduling the send at the window end.
    // That path now goes through the batch variant, and a dropped scheduledAt
    // would not fail anything loudly — it would just mail every message
    // immediately, silently undoing the coalescing.
    it('carries an explicit future scheduledAt through the batch insert', async () => {
      const { db, repo } = await setup();
      const future = new Date(Date.now() + 600_000);

      await repo.enqueueMany([
        { ...mk('a@x.com'), scheduledAt: future },
        { ...mk('b@x.com'), scheduledAt: future },
      ]);

      const rows = await db
        .select({ to: outboxEntries.toAddr, scheduledAt: outboxEntries.scheduledAt })
        .from(outboxEntries);
      expect(rows).toHaveLength(2);
      for (const r of rows) {
        expect(new Date(r.scheduledAt).getTime()).toBe(future.getTime());
      }
    });
  });

  it('enqueue honours an explicit future scheduledAt (delayed digest)', async () => {
    const { db, repo } = await setup();
    const future = new Date(Date.now() + 600_000); // 10 min out
    const entry = await repo.enqueue({
      event: 'chat.message',
      to: 'pg@toss.im',
      subject: 'S',
      html: '<a>x</a>',
      dedupeKey: 'chat-digest:c1:u1:42',
      scheduledAt: future,
    });
    expect(entry).not.toBeNull();
    // The persisted scheduled_at reflects the explicit future time, NOT now().
    const [row] = await db
      .select({ scheduledAt: outboxEntries.scheduledAt })
      .from(outboxEntries)
      .where(eq(outboxEntries.id, entry!.id));
    expect(new Date(row.scheduledAt).getTime()).toBe(future.getTime());
    // Not yet due — dueChatDigests must not return it.
    const due = await repo.dueChatDigests(10);
    expect(due).toHaveLength(0);
  });

  it('allows multiple entries with no dedupeKey', async () => {
    const { repo } = await setup();
    await repo.enqueue({
      event: 'auth.verify',
      to: 'a@e.com',
      subject: 'S',
      html: '',
    });
    await repo.enqueue({
      event: 'auth.verify',
      to: 'b@e.com',
      subject: 'S',
      html: '',
    });
    const pending = await repo.pending(10);
    expect(pending).toHaveLength(2);
  });

  it('flush marks sent and excludes from subsequent pending', async () => {
    const { repo } = await setup();
    await repo.enqueue({
      event: 'auth.verify',
      to: 'u@e.com',
      subject: 'S',
      html: '',
    });
    const { ok, failed } = await repo.flush(okBatch);
    expect(ok).toBe(1);
    expect(failed).toBe(0);
    const pending = await repo.pending(10);
    expect(pending).toHaveLength(0);
  });

  it('flush sends ALL claimed entries in a single batch call (rate-limit fix)', async () => {
    const { repo } = await setup();
    const sender = vi
      .fn<BatchSender>()
      .mockImplementation(async (entries) => entries.map(() => ({ ok: true })));
    for (let i = 0; i < 3; i++) {
      await repo.enqueue({ event: 'rfp.invited', to: `pg${i}@e.com`, subject: 'S', html: '' });
    }

    const { ok } = await repo.flush(sender);

    expect(ok).toBe(3);
    // 3 rows → ONE batch.send call carrying all 3 (not 3 separate calls).
    expect(sender).toHaveBeenCalledTimes(1);
    expect(sender.mock.calls[0][0]).toHaveLength(3);
  });

  it('flush reschedules a RETRYABLE failure into the future with backoff (not the 5-min lease)', async () => {
    const { db, repo } = await setup();
    const sender = vi
      .fn<BatchSender>()
      .mockImplementation(async (entries) =>
        entries.map(() => ({ ok: false as const, error: '429', retryable: true })),
      );
    await repo.enqueue({ event: 'auth.reset', to: 'u@e.com', subject: 'S', html: '', maxAttempts: 5 });

    const before = Date.now();
    const r = await repo.flush(sender);
    expect(r.failed).toBe(1);

    const [row] = await db
      .select({ status: outboxEntries.status, attempts: outboxEntries.attempts, scheduledAt: outboxEntries.scheduledAt })
      .from(outboxEntries);
    expect(row.status).toBe('pending');
    expect(row.attempts).toBe(1);
    const next = new Date(row.scheduledAt).getTime();
    // Rescheduled into the future…
    expect(next).toBeGreaterThan(before);
    // …by the backoff window (tens of seconds), NOT the 5-minute crash-safety
    // lease — proving markResult applied computeBackoff, not just the lease bump.
    expect(next).toBeLessThan(before + 120_000);
  });

  it('flush fails a PERMANENT (non-retryable) error immediately, ignoring maxAttempts', async () => {
    const { db, repo } = await setup();
    const sender = vi
      .fn<BatchSender>()
      .mockImplementation(async (entries) =>
        entries.map(() => ({ ok: false as const, error: 'bad address', retryable: false })),
      );
    await repo.enqueue({ event: 'rfp.invited', to: 'bad', subject: 'S', html: '', maxAttempts: 5 });

    const r = await repo.flush(sender);

    expect(r.failed).toBe(1);
    const [row] = await db
      .select({ status: outboxEntries.status, attempts: outboxEntries.attempts })
      .from(outboxEntries);
    // One attempt, already 'failed' — did not waste the remaining 4 attempts.
    expect(row.status).toBe('failed');
    expect(row.attempts).toBe(1);
  });

  it('flush retries failed entries up to maxAttempts then marks failed', async () => {
    const { db, repo } = await setup();
    const failSender = vi
      .fn<BatchSender>()
      .mockImplementation(async (entries) => entries.map(() => ({ ok: false as const, error: 'SMTP down' })));
    await repo.enqueue({
      event: 'auth.reset',
      to: 'u@e.com',
      subject: 'S',
      html: '',
      maxAttempts: 2,
    });

    // round 1 — attempts 0 → 1, stays pending. The lease bumps
    // scheduled_at 5min out so `pending()` (which filters by `scheduled_at
    // <= now()`) returns empty until the lease expires; we read raw rows
    // to assert the status/attempts state.
    let r = await repo.flush(failSender);
    expect(r.failed).toBe(1);
    let rows = await readAll(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('pending');
    expect(rows[0].attempts).toBe(1);

    // Reset the lease so round 2 can claim the row again — production
    // waits 5 min between retries, the test fast-forwards. Drizzle update()
    // without a where clause updates all rows, which is exactly what we
    // want here (single-row test).
    await db
      .update(outboxEntries)
      .set({ scheduledAt: new Date(0) });

    // round 2 — attempts 1 → 2 == maxAttempts, flips to 'failed'.
    r = await repo.flush(failSender);
    expect(r.failed).toBe(1);
    rows = await readAll(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('failed');
    expect(rows[0].attempts).toBe(2);
  });

  it('flush does not re-send already-sent entries', async () => {
    const { repo } = await setup();
    const sender = vi
      .fn<BatchSender>()
      .mockImplementation(async (entries) => entries.map(() => ({ ok: true })));
    await repo.enqueue({
      event: 'auth.verify',
      to: 'u@e.com',
      subject: 'S',
      html: '',
    });
    await repo.flush(sender);
    await repo.flush(sender);
    // First flush claims+sends the row (1 batch call); second finds nothing.
    expect(sender).toHaveBeenCalledTimes(1);
  });

  it('two concurrent flushes do not double-deliver (lease bumps scheduled_at past the SELECT-commit gap)', async () => {
    // The lease (UPDATE scheduled_at = now() + 5min inside the SELECT tx)
    // moves claimed rows out of the `scheduled_at <= now()` window before
    // the tx commits. A concurrent flush after that point sees an empty
    // ready-set and skips the rows — even though SKIP LOCKED alone only
    // protects rows during the tx itself.
    const { repo } = await setup();
    const sender = vi
      .fn<BatchSender>()
      .mockImplementation(async (entries) => entries.map(() => ({ ok: true })));
    for (let i = 0; i < 5; i++) {
      await repo.enqueue({
        event: 'auth.verify',
        to: `u${i}@e.com`,
        subject: 'S',
        html: '',
      });
    }

    const [a, b] = await Promise.all([
      repo.flush(sender),
      repo.flush(sender),
    ]);
    expect(a.ok + b.ok).toBe(5);
    // Each entry is sent exactly once across the two flushes — regardless of how
    // the batch calls split, the total entries delivered must be 5 (no dupes).
    const totalDelivered = sender.mock.calls.reduce((n, c) => n + c[0].length, 0);
    expect(totalDelivered).toBe(5);
    const pending = await repo.pending(10);
    expect(pending).toHaveLength(0);
  });
});

describe('DrizzleOutboxRepository / chat-digest separation', () => {
  // Seed a chat.message row at an arbitrary scheduled_at. enqueue() always
  // uses the column default (now()), so future-scheduled rows are written raw.
  async function seedChat(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db: any,
    to: string,
    dedupeKey: string,
    scheduledAt: Date,
  ) {
    await db.insert(outboxEntries).values({
      event: 'chat.message',
      toAddr: to,
      subject: `[서포트비] ${to}`,
      html: '<a>x</a>',
      dedupeKey,
      scheduledAt,
    });
  }

  it('generic flush does NOT touch chat.message rows', async () => {
    const { db, repo } = await setup();
    const sender = vi
      .fn<BatchSender>()
      .mockImplementation(async (entries) => entries.map(() => ({ ok: true })));
    // Due chat.message row (scheduled now) — generic flush must skip it.
    await seedChat(db, 'pg@toss.im', 'chat-digest:c1:u1:100', new Date());

    const { ok, failed } = await repo.flush(sender);

    expect(ok).toBe(0);
    expect(failed).toBe(0);
    expect(sender).not.toHaveBeenCalled();
    // Row stays pending, untouched.
    const rows = await readAll(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('pending');
    expect(rows[0].attempts).toBe(0);
  });

  it('generic flush still drains non-chat rows unchanged', async () => {
    const { db, repo } = await setup();
    const sender = vi
      .fn<BatchSender>()
      .mockImplementation(async (entries) => entries.map(() => ({ ok: true })));
    await repo.enqueue({
      event: 'auth.verify',
      to: 'a@e.com',
      subject: 'S',
      html: '',
    });
    // A chat row alongside it must NOT be drained.
    await seedChat(db, 'pg@toss.im', 'chat-digest:c1:u1:100', new Date());

    const { ok, failed } = await repo.flush(sender);

    expect(ok).toBe(1);
    expect(failed).toBe(0);
    expect(sender).toHaveBeenCalledTimes(1);
    // The batch carries exactly the one non-chat row.
    expect(sender.mock.calls[0][0]).toHaveLength(1);
    expect(sender.mock.calls[0][0][0].event).toBe('auth.verify');
    // chat row is still pending.
    const chatStill = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.event, 'chat.message'));
    expect(chatStill).toHaveLength(1);
    expect(chatStill[0].status).toBe('pending');
  });

  it('pending() excludes chat.message rows', async () => {
    const { db, repo } = await setup();
    await repo.enqueue({
      event: 'auth.verify',
      to: 'a@e.com',
      subject: 'S',
      html: '',
    });
    await seedChat(db, 'pg@toss.im', 'chat-digest:c1:u1:100', new Date());

    const pending = await repo.pending(10);

    expect(pending).toHaveLength(1);
    expect(pending[0].event).toBe('auth.verify');
  });

  it('dueChatDigests returns only due chat.message rows', async () => {
    const { db, repo } = await setup();
    const now = Date.now();
    // due chat row (past schedule)
    await seedChat(db, 'due@toss.im', 'chat-digest:c1:u1:1', new Date(now - 1000));
    // future-scheduled chat row — not yet due
    await seedChat(db, 'future@toss.im', 'chat-digest:c1:u2:9', new Date(now + 600_000));
    // due non-chat row — must NOT be returned by dueChatDigests
    await repo.enqueue({
      event: 'auth.verify',
      to: 'a@e.com',
      subject: 'S',
      html: '',
    });

    const due = await repo.dueChatDigests(10);

    expect(due).toHaveLength(1);
    expect(due[0].event).toBe('chat.message');
    expect(due[0].to).toBe('due@toss.im');
    expect(due[0].dedupeKey).toBe('chat-digest:c1:u1:1');
    expect(due[0].id).toBeTruthy();
    expect(due[0].scheduledAt).toBeTruthy();
  });
});

describe('DrizzleOutboxRepository / team-chat-digest separation', () => {
  it('dueTeamChatDigests returns team_chat.message rows; pending() excludes them', async () => {
    const db = await createPgliteDb();
    const repo = new DrizzleOutboxRepository(db);
    const past = new Date(Date.now() - 60_000);
    await repo.enqueue({ event: 'team_chat.message', to: 't@b.com', subject: 's', html: '<p>x</p>', dedupeKey: 'team-digest:r:w:u:1', scheduledAt: past });
    const due = await repo.dueTeamChatDigests(50);
    expect(due.map((d) => d.event)).toContain('team_chat.message');
    const generic = await repo.pending(50);
    expect(generic.find((g) => g.event === 'team_chat.message')).toBeUndefined();
  });
});

describe('DrizzleOutboxRepository.findLatestFailed / requeue (retryEmail)', () => {
  // Seed a failed row with an explicit scheduledAt for deterministic ordering.
  async function seedFailed(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db: any,
    opts: { to: string; event: string; scheduledAt: Date; attempts?: number },
  ) {
    await db.insert(outboxEntries).values({
      event: opts.event,
      toAddr: opts.to,
      subject: 'S',
      html: '<a>x</a>',
      status: 'failed',
      attempts: opts.attempts ?? 5,
      maxAttempts: 5,
      lastError: 'SMTP down',
      scheduledAt: opts.scheduledAt,
    });
  }

  it('findLatestFailed returns the most recent failed row for (to, event)', async () => {
    const { db, repo } = await setup();
    const now = Date.now();
    await seedFailed(db, { to: 'u@e.com', event: 'rfp.invited', scheduledAt: new Date(now - 2000) });
    await seedFailed(db, { to: 'u@e.com', event: 'rfp.invited', scheduledAt: new Date(now - 1000) });

    const latest = await db
      .select({ id: outboxEntries.id, scheduledAt: outboxEntries.scheduledAt })
      .from(outboxEntries)
      .orderBy(sql`${outboxEntries.scheduledAt} desc`)
      .limit(1);

    const row = await repo.findLatestFailed({ to: 'u@e.com', event: 'rfp.invited' });
    expect(row).toBeDefined();
    expect(row!.id).toBe(latest[0].id);
  });

  it('findLatestFailed ignores non-failed rows and other (to, event)', async () => {
    const { db, repo } = await setup();
    const now = Date.now();
    // pending row for same to+event — must be ignored.
    await repo.enqueue({ event: 'rfp.invited', to: 'u@e.com', subject: 'S', html: '' });
    // failed row but different recipient — ignored.
    await seedFailed(db, { to: 'other@e.com', event: 'rfp.invited', scheduledAt: new Date(now - 1000) });
    // failed row but different event — ignored.
    await seedFailed(db, { to: 'u@e.com', event: 'auth.verify', scheduledAt: new Date(now - 1000) });

    expect(await repo.findLatestFailed({ to: 'u@e.com', event: 'rfp.invited' })).toBeUndefined();
  });

  it('requeue flips a failed row back to pending', async () => {
    const { db, repo } = await setup();
    await seedFailed(db, { to: 'u@e.com', event: 'rfp.invited', scheduledAt: new Date() });
    const found = await repo.findLatestFailed({ to: 'u@e.com', event: 'rfp.invited' });
    expect(found).toBeDefined();

    await repo.requeue(found!.id);

    const [row] = await db
      .select({ status: outboxEntries.status, attempts: outboxEntries.attempts, lastError: outboxEntries.lastError })
      .from(outboxEntries)
      .where(eq(outboxEntries.id, found!.id));
    expect(row.status).toBe('pending');
    // requeue only flips status — attempts/lastError are preserved.
    expect(row.attempts).toBe(5);
    expect(row.lastError).toBe('SMTP down');
  });

  it('requeue 는 백오프로 미래에 밀린 scheduled_at 을 now 로 되돌린다 (수동 재시도 즉시 발송)', async () => {
    const { db, repo } = await setup();
    // 백오프가 1시간 뒤로 밀어둔 실패 행 — 리셋 없이는 그 시각까지 발송되지 않는다.
    const future = new Date(Date.now() + 60 * 60 * 1000);
    await seedFailed(db, { to: 'u@e.com', event: 'rfp.invited', scheduledAt: future });
    const found = await repo.findLatestFailed({ to: 'u@e.com', event: 'rfp.invited' });

    await repo.requeue(found!.id);

    const [row] = await db
      .select({ status: outboxEntries.status, scheduledAt: outboxEntries.scheduledAt })
      .from(outboxEntries)
      .where(eq(outboxEntries.id, found!.id));
    expect(row.status).toBe('pending');
    // now() 로 리셋 — 폴러의 scheduled_at <= now 조건에 즉시 걸린다 (5초 슬랙).
    expect(new Date(row.scheduledAt).getTime()).toBeLessThanOrEqual(Date.now() + 5_000);
  });
});
