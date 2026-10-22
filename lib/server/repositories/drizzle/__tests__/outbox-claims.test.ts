import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { outboxEntries } from '@/lib/db/schema';
import { DrizzleOutboxRepository } from '../outbox';

async function setup() {
  const db = await createPgliteDb();
  const repo = new DrizzleOutboxRepository(db);
  await repo.enqueue({
    event: 'auth.verify',
    to: 'u@e.com',
    subject: 'S',
    html: '',
  });
  return { db, repo };
}

describe('outbox claim ownership', () => {
  it('reclaims an expired delivery with a new token and ignores the old worker result', async () => {
    const { db, repo } = await setup();
    const [first] = await repo.claimDue('generic', 10);
    expect(first.claimToken).toEqual(expect.any(String));
    expect(await repo.claimDue('generic', 10)).toEqual([]);
    await db.update(outboxEntries).set({ claimExpiresAt: new Date(0) });
    const [second] = await repo.claimDue('generic', 10);
    expect(second.id).toBe(first.id);
    expect(second.claimToken).not.toBe(first.claimToken);
    expect(
      await repo.completeClaim(first.id, first.claimToken, { ok: true }),
    ).toBe(false);
    expect(
      await repo.completeClaim(first.id, first.claimToken, {
        ok: false,
        error: 'late',
        retryable: false,
      }),
    ).toBe(false);
    const [pending] = await db.select().from(outboxEntries);
    expect(pending.status).toBe('pending');
    expect(pending.attempts).toBe(0);
    expect(
      await repo.completeClaim(second.id, second.claimToken, { ok: true }),
    ).toBe(true);
    expect(
      await repo.completeClaim(second.id, second.claimToken, { ok: true }),
    ).toBe(false);
    const [sent] = await db.select().from(outboxEntries);
    expect(sent.status).toBe('sent');
    expect(sent.attempts).toBe(1);
    expect(sent.claimToken).toBeNull();
    expect(sent.claimExpiresAt).toBeNull();
  });

  it('rejects completion after ownership expires even before another worker claims', async () => {
    const { db, repo } = await setup();
    const [claim] = await repo.claimDue('generic', 10);
    await db.update(outboxEntries).set({ claimExpiresAt: new Date(0) });
    expect(
      await repo.completeClaim(claim.id, claim.claimToken, { ok: true }),
    ).toBe(false);
    const [row] = await db.select().from(outboxEntries);
    expect(row.attempts).toBe(0);
    expect(row.status).toBe('pending');
  });

  it('releases retryable failures at the supplied retry time without retaining a lease', async () => {
    const { db, repo } = await setup();
    const [claim] = await repo.claimDue('generic', 10);
    const nextScheduledAt = new Date(Date.now() + 60_000);
    expect(
      await repo.completeClaim(claim.id, claim.claimToken, {
        ok: false,
        error: 'rate limited',
        nextScheduledAt,
      }),
    ).toBe(true);
    const [row] = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.id, claim.id));
    expect(row.status).toBe('pending');
    expect(row.attempts).toBe(1);
    expect(row.scheduledAt).toEqual(nextScheduledAt);
    expect(row.claimToken).toBeNull();
    expect(row.claimExpiresAt).toBeNull();
    expect(await repo.claimDue('generic', 10)).toEqual([]);
  });

  it('only renews claims still owned by the caller', async () => {
    const { db, repo } = await setup();
    const [claim] = await repo.claimDue('generic', 10);
    const soon = new Date(Date.now() + 1_000);
    await db.update(outboxEntries).set({ claimExpiresAt: soon });
    expect(await repo.renewClaims([claim])).toEqual([claim.id]);
    const [renewed] = await db.select().from(outboxEntries);
    expect(renewed.claimExpiresAt!.getTime()).toBeGreaterThan(soon.getTime());
    await db.update(outboxEntries).set({ claimExpiresAt: new Date(0) });
    expect(await repo.renewClaims([claim])).toEqual([]);
    const [replacement] = await repo.claimDue('generic', 10);
    expect(await repo.renewClaims([claim])).toEqual([]);
    expect(await repo.renewClaims([replacement])).toEqual([claim.id]);
  });
  it('rejects a partially recorded claim', async () => {
    const { db } = await setup();
    await expect(
      db
        .update(outboxEntries)
        .set({ claimToken: 'aaaaaaaa-0000-4000-8000-000000000001' }),
    ).rejects.toThrow();
    await expect(
      db.update(outboxEntries).set({ claimExpiresAt: new Date() }),
    ).rejects.toThrow();
  });

  it('a delayed retry request cannot clear a delivery already claimed after requeue', async () => {
    const { db, repo } = await setup();
    const [failed] = await repo.claimDue('generic', 1);
    await repo.completeClaim(failed.id, failed.claimToken, {
      ok: false,
      error: 'permanent',
      retryable: false,
    });
    await repo.requeue(failed.id);
    const [active] = await repo.claimDue('generic', 1);
    await repo.requeue(failed.id);
    const [row] = await db.select().from(outboxEntries);
    expect(row.claimToken).toBe(active.claimToken);
    expect(await repo.claimDue('generic', 1)).toEqual([]);
    expect(
      await repo.completeClaim(active.id, active.claimToken, { ok: true }),
    ).toBe(true);
  });
});
