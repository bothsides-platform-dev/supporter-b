// DrizzleLoginAttemptRepository — server-side login throttle counter store.
//   - findByKey() reads the counter row (count + lockedUntil); miss → undefined.
//   - upsert() inserts a new row then updates it by key.
//   - clear() deletes the listed keys; empty array is a safe no-op.
//   - clear()/release() take row locks in reserve()'s key order, atomically.
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPgliteDb } from '@/lib/db/client-pglite';
import { DrizzleLoginAttemptRepository } from '../login-attempt';

async function setup() {
  const db = await createPgliteDb();
  return { db, repo: new DrizzleLoginAttemptRepository(db) };
}

describe('DrizzleLoginAttemptRepository', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });

  it('findByKey() returns undefined for an unknown key', async () => {
    expect(await ctx.repo.findByKey('email:nobody@x.com')).toBeUndefined();
  });

  it('upsert() inserts then findByKey() returns the counter', async () => {
    await ctx.repo.upsert('email:a@x.com', {
      count: 3,
      lockedUntil: null,
      updatedAt: new Date(),
    });
    const rec = await ctx.repo.findByKey('email:a@x.com');
    expect(rec?.count).toBe(3);
    expect(rec?.lockedUntil).toBeNull();
  });

  it('upsert() updates an existing key (count + lockedUntil)', async () => {
    const lockedUntil = new Date(Date.now() + 15 * 60_000);
    await ctx.repo.upsert('ip:1.2.3.4', { count: 5, lockedUntil: null, updatedAt: new Date() });
    await ctx.repo.upsert('ip:1.2.3.4', { count: 10, lockedUntil, updatedAt: new Date() });

    const rec = await ctx.repo.findByKey('ip:1.2.3.4');
    expect(rec?.count).toBe(10);
    expect(rec?.lockedUntil).toBeInstanceOf(Date);
    expect(rec?.lockedUntil?.getTime()).toBe(lockedUntil.getTime());
  });

  it('clear() deletes the listed keys', async () => {
    await ctx.repo.upsert('email:b@x.com', { count: 2, lockedUntil: null, updatedAt: new Date() });
    await ctx.repo.upsert('ip:9.9.9.9', { count: 4, lockedUntil: null, updatedAt: new Date() });

    await ctx.repo.clear(['email:b@x.com', 'ip:9.9.9.9']);
    expect(await ctx.repo.findByKey('email:b@x.com')).toBeUndefined();
    expect(await ctx.repo.findByKey('ip:9.9.9.9')).toBeUndefined();
  });

  it('clear([]) is a safe no-op and leaves other rows intact', async () => {
    await ctx.repo.upsert('email:c@x.com', { count: 1, lockedUntil: null, updatedAt: new Date() });
    await expect(ctx.repo.clear([])).resolves.toBeUndefined();
    expect((await ctx.repo.findByKey('email:c@x.com'))?.count).toBe(1);
  });

  it('reserve() admits parallel requests into distinct atomic slots', async () => {
    const now = new Date('2026-10-16T00:00:00.000Z');
    const lockUntil = new Date('2026-10-16T00:15:00.000Z');
    const results = await Promise.all(
      Array.from({ length: 11 }, () =>
        ctx.repo.reserve(['email:parallel@example.com'], {
          threshold: 10,
          now,
          lockUntil,
        }),
      ),
    );

    const counts = results.flatMap((result) => (result.allowed ? result.records.map((row) => row.count) : [])).sort((a, b) => a - b);
    expect(counts).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(results.filter((result) => !result.allowed)).toHaveLength(1);
    expect(await ctx.repo.findByKey('email:parallel@example.com')).toEqual({
      count: 10,
      lockedUntil: lockUntil,
    });
  });

  it('reserve() updates email and IP buckets in one transaction and resets expired locks', async () => {
    const oldLock = new Date('2026-10-16T00:00:00.000Z');
    const now = new Date('2026-10-16T00:00:01.000Z');
    const lockUntil = new Date('2026-10-16T00:15:01.000Z');
    await ctx.repo.upsert('email:reset@example.com', {
      count: 10,
      lockedUntil: oldLock,
      updatedAt: oldLock,
    });

    const result = await ctx.repo.reserve(['email:reset@example.com', 'ip:203.0.113.8'], { threshold: 10, now, lockUntil });

    expect(result.allowed).toBe(true);
    if (!result.allowed) return;
    expect(result.records).toEqual(
      expect.arrayContaining([
        { key: 'email:reset@example.com', count: 1, lockedUntil: null },
        { key: 'ip:203.0.113.8', count: 1, lockedUntil: null },
      ]),
    );
  });

  describe.each([
    { method: 'clear', event: 'DELETE', returning: 'OLD' },
    { method: 'release', event: 'UPDATE', returning: 'NEW' },
  ] as const)('$method() write ordering', ({ method, event, returning }) => {
    // Already unsorted, and stored in the opposite order to reserve()'s locks.
    const keys = ['ip:192.0.2.1', 'email:order@example.com'];
    const write = () =>
      method === 'clear' ? ctx.repo.clear(keys) : ctx.repo.release(keys, 10);

    async function onWrite(body: string) {
      await ctx.db.execute(sql.raw(`
        CREATE OR REPLACE FUNCTION probe_login_write() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN ${body} RETURN ${returning}; END $$`));
      await ctx.db.execute(sql.raw(`
        CREATE TRIGGER probe_login_write BEFORE ${event} ON login_attempts
        FOR EACH ROW EXECUTE FUNCTION probe_login_write()`));
    }

    beforeEach(async () => {
      // A heap scan makes the set-based failure independent of planner statistics.
      await ctx.db.execute(sql.raw('SET enable_indexscan = off'));
      await ctx.db.execute(sql.raw('SET enable_bitmapscan = off'));
      await ctx.db.execute(sql.raw('CREATE TEMP TABLE write_order (seq serial, key text)'));
      for (const key of keys) {
        await ctx.repo.upsert(key, { count: 2, lockedUntil: null, updatedAt: new Date() });
      }
    });
    afterEach(async () => {
      await ctx.db.execute(sql.raw('DROP TRIGGER IF EXISTS probe_login_write ON login_attempts'));
      await ctx.db.execute(sql.raw('DROP TABLE IF EXISTS write_order'));
      await ctx.db.execute(sql.raw('RESET enable_indexscan'));
      await ctx.db.execute(sql.raw('RESET enable_bitmapscan'));
    });

    // PGlite has one connection and cannot deadlock. A BEFORE row trigger runs in
    // lock-acquisition order, so it exposes the order that prevents the deadlock.
    it('locks rows in the same key order as reserve()', async () => {
      await onWrite('INSERT INTO write_order (key) VALUES (OLD.key);');

      await write();

      const { rows } = await ctx.db.execute(sql.raw('SELECT key FROM write_order ORDER BY seq'));
      expect(rows).toEqual([{ key: 'email:order@example.com' }, { key: 'ip:192.0.2.1' }]);
    });

    it('changes neither bucket when the second write fails', async () => {
      await onWrite("IF OLD.key LIKE 'ip:%' THEN RAISE EXCEPTION 'second write failed'; END IF;");

      await expect(write()).rejects.toThrow();

      for (const key of keys) expect((await ctx.repo.findByKey(key))?.count).toBe(2);
    });
  });
});
