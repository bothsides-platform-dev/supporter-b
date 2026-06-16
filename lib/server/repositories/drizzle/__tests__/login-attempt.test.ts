// DrizzleLoginAttemptRepository — server-side login throttle counter store.
//   - findByKey() reads the counter row (count + lockedUntil); miss → undefined.
//   - upsert() inserts a new row then updates it by key.
//   - clear() deletes the listed keys; empty array is a safe no-op.
import { beforeEach, describe, expect, it } from 'vitest';

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
});
