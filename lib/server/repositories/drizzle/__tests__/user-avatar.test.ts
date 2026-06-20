// DrizzleUserAvatarRepository — user avatar bytea blob storage.
//   - find() returns raw bytes + mime (Buffer round-trip through pglite).
//   - exists() is a cheap presence check.
//   - upsert() inserts then overwrites by user_id.
//   - remove() deletes the row.
import { beforeEach, describe, expect, it } from 'vitest';

import { createPgliteDb } from '@/lib/db/client-pglite';
import { DrizzleUserAvatarRepository } from '../user-avatar';
import { seedUser } from './_seed';

async function setup() {
  const db = await createPgliteDb();
  const u = await seedUser(db);
  return { db, repo: new DrizzleUserAvatarRepository(db), userId: u.id };
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x10, 0x20, 0x30]);

describe('DrizzleUserAvatarRepository', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });

  it('find() returns undefined when no avatar exists', async () => {
    expect(await ctx.repo.find(ctx.userId)).toBeUndefined();
  });

  it('exists() is false before upsert, true after', async () => {
    expect(await ctx.repo.exists(ctx.userId)).toBe(false);
    await ctx.repo.upsert(ctx.userId, PNG, 'image/png');
    expect(await ctx.repo.exists(ctx.userId)).toBe(true);
  });

  it('upsert() then find() round-trips bytes + mime', async () => {
    await ctx.repo.upsert(ctx.userId, PNG, 'image/png');
    const found = await ctx.repo.find(ctx.userId);
    expect(found?.mime).toBe('image/png');
    expect(Buffer.isBuffer(found?.bytes)).toBe(true);
    expect(found?.bytes.equals(PNG)).toBe(true);
  });

  it('upsert() overwrites an existing avatar (by user_id)', async () => {
    await ctx.repo.upsert(ctx.userId, PNG, 'image/png');
    await ctx.repo.upsert(ctx.userId, JPG, 'image/jpeg');
    const found = await ctx.repo.find(ctx.userId);
    expect(found?.mime).toBe('image/jpeg');
    expect(found?.bytes.equals(JPG)).toBe(true);
  });

  it('remove() deletes the avatar', async () => {
    await ctx.repo.upsert(ctx.userId, PNG, 'image/png');
    await ctx.repo.remove(ctx.userId);
    expect(await ctx.repo.exists(ctx.userId)).toBe(false);
    expect(await ctx.repo.find(ctx.userId)).toBeUndefined();
  });
});
