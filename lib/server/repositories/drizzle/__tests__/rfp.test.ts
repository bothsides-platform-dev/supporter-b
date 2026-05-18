import { describe, expect, it, beforeEach } from 'vitest';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { DrizzleRfpRepository } from '../rfp';
import type { RFP } from '@/lib/types/rfp';
import { seedBizProfile, seedBuyerWorkspace, seedUser } from './_seed';

async function setup() {
  const db = await createPgliteDb();
  const user = await seedUser(db);
  const biz = await seedBizProfile(db, { bizNo: '1234567890' });
  const ws = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
  const repo = new DrizzleRfpRepository(db);
  return { db, repo, user, biz, ws };
}

function makeRfp(
  id: string,
  buyerWsId: string,
  createdBy: string,
  status: RFP['status'] = 'draft',
): RFP {
  return {
    id,
    buyerWsId,
    bizProfile: {
      bizNo: '1234567890',
      taxType: 'general',
      status: 'active',
      grade: 'general',
      gradeSource: 'user_confirmed',
    },
    title: 'Test RFP',
    memo: '',
    rfpFiles: [],
    allowedPgWorkspaceIds: [],
    deadline: new Date(Date.now() + 86_400_000).toISOString(),
    status,
    createdBy,
    createdAt: new Date().toISOString(),
  };
}

describe('DrizzleRfpRepository', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  let repo: DrizzleRfpRepository;
  let db: PgliteDB;

  beforeEach(async () => {
    ctx = await setup();
    repo = ctx.repo;
    db = ctx.db;
  });

  it('saves and retrieves by id', async () => {
    await repo.save(makeRfp('P-2605-0001', ctx.ws.id, ctx.user.id));
    const fetched = await repo.findById('P-2605-0001');
    expect(fetched).toMatchObject({ id: 'P-2605-0001', status: 'draft' });
    expect(fetched!.bizProfile?.bizNo).toBe('1234567890');
  });

  it('returns undefined for unknown id', async () => {
    expect(await repo.findById('Q-NONE')).toBeUndefined();
  });

  it('findByBuyerWs returns only matching workspace RFPs', async () => {
    const otherBiz = await seedBizProfile(db, { bizNo: '9999999999' });
    const otherWs = await seedBuyerWorkspace(db, { bizProfileId: otherBiz.id });
    await repo.save(makeRfp('P-2605-0001', ctx.ws.id, ctx.user.id));
    await repo.save({
      ...makeRfp('P-2605-0002', otherWs.id, ctx.user.id),
      bizProfile: {
        bizNo: '9999999999',
        taxType: 'general',
        status: 'active',
        gradeSource: 'user_confirmed',
      },
    });
    expect(await repo.findByBuyerWs(ctx.ws.id)).toHaveLength(1);
    expect(await repo.findByBuyerWs(otherWs.id)).toHaveLength(1);
  });

  it('transitions draft → sent', async () => {
    await repo.save(makeRfp('P-2605-0001', ctx.ws.id, ctx.user.id));
    const updated = await repo.transition('P-2605-0001', 'sent');
    expect(updated.status).toBe('sent');
  });

  it('throws on invalid transition (draft → awarded)', async () => {
    await repo.save(makeRfp('P-2605-0001', ctx.ws.id, ctx.user.id));
    await expect(repo.transition('P-2605-0001', 'awarded')).rejects.toThrow(
      'Invalid RFP transition',
    );
  });

  it('throws when RFP not found', async () => {
    await expect(repo.transition('Q-NONE', 'sent')).rejects.toThrow('not found');
  });

  it('concurrent transition: only one of two parallel sent->closed wins', async () => {
    await repo.save(makeRfp('P-2605-0010', ctx.ws.id, ctx.user.id, 'sent'));
    const results = await Promise.allSettled([
      repo.transition('P-2605-0010', 'closed'),
      repo.transition('P-2605-0010', 'cancelled'),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    // The losing call hits either the assertTransition guard (sent->closed
    // already moved to closed) or the WHERE status=$prev concurrency guard.
    const reason = (rejected[0] as PromiseRejectedResult).reason as Error;
    expect(reason.message).toMatch(/Invalid RFP transition|lost a race/);
  });
});
