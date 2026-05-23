import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { DrizzleColumnRepository } from '@/lib/server/repositories/drizzle/column';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { defaultColumns } from '@/lib/server/columns/seed';
import { seedBuyerWorkspace } from './_seed';
import type { BoardColumn } from '@/lib/types/column';

async function setup() {
  const db = await createPgliteDb();
  const ws = await seedBuyerWorkspace(db);
  const repo = new DrizzleColumnRepository(db);
  return { db, ws, repo };
}

function customColumn(wsId: string): BoardColumn {
  return {
    id: randomUUID(),
    workspaceId: wsId,
    kind: 'pipeline',
    title: '보류',
    position: 'a5',
    color: 'warning',
    lifecycleKey: null,
  };
}

describe('DrizzleColumnRepository', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });

  it('createMany + listByBoard returns each kind ordered by position', async () => {
    await ctx.repo.createMany(defaultColumns(ctx.ws.id, 'buyer'));

    const pipeline = await ctx.repo.listByBoard(ctx.ws.id, 'pipeline');
    expect(pipeline.map((c) => c.lifecycleKey)).toEqual([
      'draft',
      'sent',
      'collecting',
      'comparing',
      'awarded',
      'closed',
    ]);

    const rfpBids = await ctx.repo.listByBoard(ctx.ws.id, 'rfp_bids');
    expect(rfpBids.map((c) => c.title)).toEqual(['진행전', '협상중', '결정']);
  });

  it('create + findById round-trips all fields', async () => {
    const col = customColumn(ctx.ws.id);
    await ctx.repo.create(col);
    const got = await ctx.repo.findById(col.id);
    expect(got).toMatchObject({
      id: col.id,
      workspaceId: ctx.ws.id,
      kind: 'pipeline',
      title: '보류',
      color: 'warning',
      lifecycleKey: null,
    });
  });

  it('update patches title/color/position', async () => {
    const col = customColumn(ctx.ws.id);
    await ctx.repo.create(col);
    await ctx.repo.update(col.id, { title: '우선검토', color: 'primary', position: 'b9' });
    const got = await ctx.repo.findById(col.id);
    expect(got?.title).toBe('우선검토');
    expect(got?.color).toBe('primary');
    expect(got?.position).toBe('b9');
  });

  it('remove deletes the column', async () => {
    const col = customColumn(ctx.ws.id);
    await ctx.repo.create(col);
    await ctx.repo.remove(col.id);
    expect(await ctx.repo.findById(col.id)).toBeUndefined();
  });
});
