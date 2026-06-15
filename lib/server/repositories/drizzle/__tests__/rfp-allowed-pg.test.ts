// DrizzleRfpAllowedPgRepository — the RFP participation allowlist (C2).
//   - add() bulk-inserts (rfp, pgWs) rows, onConflictDoNothing; empty array is
//     a safe no-op.
//   - listPgWsIds() returns the allowed PG workspace ids for an RFP.
//   - has() is the (rfp, pgWs) membership check.
import { beforeEach, describe, expect, it } from 'vitest';

import { createPgliteDb } from '@/lib/db/client-pglite';
import { DrizzleRfpAllowedPgRepository } from '../rfp-allowed-pg';
import {
  seedBuyerWorkspace,
  seedPgWorkspace,
  seedRfp,
  seedUser,
} from './_seed';

async function setup() {
  const db = await createPgliteDb();
  const buyer = await seedUser(db, { email: 'buyer@allow.com' });
  const buyerWs = await seedBuyerWorkspace(db);
  const rfp = await seedRfp(db, { buyerWsId: buyerWs.id, createdBy: buyer.id });
  const pgA = await seedPgWorkspace(db, 'a.im');
  const pgB = await seedPgWorkspace(db, 'b.im');
  const pgC = await seedPgWorkspace(db, 'c.im');
  return {
    db,
    repo: new DrizzleRfpAllowedPgRepository(db),
    rfpId: rfp.id,
    pgA: pgA.id,
    pgB: pgB.id,
    pgC: pgC.id,
  };
}

describe('DrizzleRfpAllowedPgRepository', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });

  it('add() registers PG workspaces; listPgWsIds() returns them', async () => {
    await ctx.repo.add(ctx.rfpId, [ctx.pgA, ctx.pgB]);
    const ids = await ctx.repo.listPgWsIds(ctx.rfpId);
    expect([...ids].sort()).toEqual([ctx.pgA, ctx.pgB].sort());
  });

  it('add([]) is a safe no-op', async () => {
    await expect(ctx.repo.add(ctx.rfpId, [])).resolves.toBeUndefined();
    expect(await ctx.repo.listPgWsIds(ctx.rfpId)).toEqual([]);
  });

  it('add() is idempotent (duplicate (rfp, pgWs) → no-op via onConflictDoNothing)', async () => {
    await ctx.repo.add(ctx.rfpId, [ctx.pgA]);
    await ctx.repo.add(ctx.rfpId, [ctx.pgA, ctx.pgB]);
    const ids = await ctx.repo.listPgWsIds(ctx.rfpId);
    expect([...ids].sort()).toEqual([ctx.pgA, ctx.pgB].sort());
  });

  it('has() returns true for allowlisted, false otherwise', async () => {
    await ctx.repo.add(ctx.rfpId, [ctx.pgA]);
    expect(await ctx.repo.has(ctx.rfpId, ctx.pgA)).toBe(true);
    expect(await ctx.repo.has(ctx.rfpId, ctx.pgC)).toBe(false);
  });
});
