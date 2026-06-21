// DrizzleWorkspaceLogoRepository — workspace logo bytea blob storage.
//   - find() returns the raw bytes + mime (Buffer round-trip through pglite).
//   - exists() is a cheap presence check for logo blob existence.
//   - upsert() inserts then overwrites by workspace_id.
//   - remove() deletes the row.
import { beforeEach, describe, expect, it } from 'vitest';

import { createPgliteDb } from '@/lib/db/client-pglite';
import { DrizzleWorkspaceLogoRepository } from '../workspace-logo';
import { seedBuyerWorkspace } from './_seed';

async function setup() {
  const db = await createPgliteDb();
  const ws = await seedBuyerWorkspace(db);
  return { db, repo: new DrizzleWorkspaceLogoRepository(db), wsId: ws.id };
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x10, 0x20, 0x30]);

describe('DrizzleWorkspaceLogoRepository', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });

  it('find() returns undefined when no logo exists', async () => {
    expect(await ctx.repo.find(ctx.wsId)).toBeUndefined();
  });

  it('exists() is false before upsert, true after', async () => {
    expect(await ctx.repo.exists(ctx.wsId)).toBe(false);
    await ctx.repo.upsert(ctx.wsId, PNG, 'image/png');
    expect(await ctx.repo.exists(ctx.wsId)).toBe(true);
  });

  it('upsert() then find() round-trips bytes + mime', async () => {
    await ctx.repo.upsert(ctx.wsId, PNG, 'image/png');
    const found = await ctx.repo.find(ctx.wsId);
    expect(found?.mime).toBe('image/png');
    expect(Buffer.isBuffer(found?.bytes)).toBe(true);
    expect(found?.bytes.equals(PNG)).toBe(true);
  });

  it('upsert() overwrites an existing logo (by workspace_id)', async () => {
    await ctx.repo.upsert(ctx.wsId, PNG, 'image/png');
    await ctx.repo.upsert(ctx.wsId, JPG, 'image/jpeg');
    const found = await ctx.repo.find(ctx.wsId);
    expect(found?.mime).toBe('image/jpeg');
    expect(found?.bytes.equals(JPG)).toBe(true);
  });

  it('remove() deletes the logo', async () => {
    await ctx.repo.upsert(ctx.wsId, PNG, 'image/png');
    await ctx.repo.remove(ctx.wsId);
    expect(await ctx.repo.exists(ctx.wsId)).toBe(false);
    expect(await ctx.repo.find(ctx.wsId)).toBeUndefined();
  });
});
