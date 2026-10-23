import { afterEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { outboxEntries } from '@/lib/db/schema';
import { DrizzleOutboxRepository } from '@/lib/server/repositories/drizzle/outbox';
import { deliverClaimedEntries, flushGenericOutbox } from '../dispatch';
import type { SendResult } from '../types';

afterEach(() => {
  vi.unstubAllEnvs();
});
async function setup() {
  const db = await createPgliteDb();
  const repo = new DrizzleOutboxRepository(db);
  const entry = (await repo.enqueue({
    event: 'auth.verify',
    to: 'first@e.com',
    subject: 'S',
    html: '',
  }))!;
  return { db, repo, entry };
}

describe('outbox delivery execution', () => {
  it('persists each completed batch before starting the next network request', async () => {
    const { db, repo, entry } = await setup();
    vi.stubEnv('EMAIL_BATCH_SIZE', '1');
    vi.stubEnv('EMAIL_BATCH_INTERVAL_MS', '0');
    await repo.enqueue({
      event: 'auth.verify',
      to: 'second@e.com',
      subject: 'S',
      html: '',
      scheduledAt: new Date(Date.now() - 10),
    });
    // Explicit order independent of random ids.
    await db
      .update(outboxEntries)
      .set({ scheduledAt: new Date(0) })
      .where(eq(outboxEntries.id, entry.id));
    let firstStateDuringSecond = '';
    await flushGenericOutbox(repo, async (entries) => {
      if (entries[0].to === 'second@e.com') {
        const [row] = await db
          .select()
          .from(outboxEntries)
          .where(eq(outboxEntries.id, entry.id));
        firstStateDuringSecond = row.status;
      }
      return entries.map(() => ({ ok: true }));
    });
    expect(firstStateDuringSecond).toBe('sent');
  });

  it('does not send an expired claim after slow digest preparation', async () => {
    const { db, repo } = await setup();
    const claims = await repo.claimDue('generic', 10);
    await db.update(outboxEntries).set({ claimExpiresAt: new Date(0) });
    const delivered: string[] = [];
    expect(
      await deliverClaimedEntries(
        repo,
        async (entries) => {
          delivered.push(...entries.map((entry) => entry.id));
          return entries.map(() => ({ ok: true }));
        },
        claims,
      ),
    ).toEqual({ ok: 0, failed: 0 });
    expect(delivered).toEqual([]);
    const [row] = await db.select().from(outboxEntries);
    expect(row.status).toBe('pending');
    expect(row.attempts).toBe(0);
  });

  it.each<SendResult>([
    { ok: true },
    { ok: false, error: 'late failure', retryable: false },
  ])(
    'does not count or commit an obsolete sender result: %j',
    async (result) => {
      const { db, repo } = await setup();
      const entered = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const obsolete = flushGenericOutbox(repo, async () => {
        entered.resolve();
        await release.promise;
        return [result];
      });
      await entered.promise;
      try {
        await db.update(outboxEntries).set({ claimExpiresAt: new Date(0) });
        expect(
          await flushGenericOutbox(repo, async (entries) =>
            entries.map(() => ({ ok: true })),
          ),
        ).toEqual({ ok: 1, failed: 0 });
      } finally {
        release.resolve();
      }
      expect(await obsolete).toEqual({ ok: 0, failed: 0 });
      const [row] = await db.select().from(outboxEntries);
      expect(row.status).toBe('sent');
      expect(row.attempts).toBe(1);
    },
  );
});
