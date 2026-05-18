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
import { sql } from 'drizzle-orm';

import { createPgliteDb } from '@/lib/db/client-pglite';
import { outboxEntries } from '@/lib/db/schema';
import { DrizzleOutboxRepository } from '../outbox';
import type { Sender } from '@/lib/server/outbox/types';

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

const okSender: Sender = async () => ({ ok: true });

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
    const { ok, failed } = await repo.flush(okSender);
    expect(ok).toBe(1);
    expect(failed).toBe(0);
    const pending = await repo.pending(10);
    expect(pending).toHaveLength(0);
  });

  it('flush retries failed entries up to maxAttempts then marks failed', async () => {
    const { db, repo } = await setup();
    const failSender = vi
      .fn<Sender>()
      .mockResolvedValue({ ok: false, error: 'SMTP down' });
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
    const sender = vi.fn<Sender>().mockResolvedValue({ ok: true });
    await repo.enqueue({
      event: 'auth.verify',
      to: 'u@e.com',
      subject: 'S',
      html: '',
    });
    await repo.flush(sender);
    await repo.flush(sender);
    expect(sender).toHaveBeenCalledTimes(1);
  });

  it('two concurrent flushes do not double-deliver (lease bumps scheduled_at past the SELECT-commit gap)', async () => {
    // The lease (UPDATE scheduled_at = now() + 5min inside the SELECT tx)
    // moves claimed rows out of the `scheduled_at <= now()` window before
    // the tx commits. A concurrent flush after that point sees an empty
    // ready-set and skips the rows — even though SKIP LOCKED alone only
    // protects rows during the tx itself.
    const { repo } = await setup();
    const sender = vi.fn<Sender>().mockResolvedValue({ ok: true });
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
    expect(sender).toHaveBeenCalledTimes(5);
    const pending = await repo.pending(10);
    expect(pending).toHaveLength(0);
  });
});
