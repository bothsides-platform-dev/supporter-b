import { describe, expect, it, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { DrizzleRfpRepository } from '../rfp';
import type { RFP } from '@/lib/types/rfp';
import { seedBizProfile, seedBuyerWorkspace, seedPgWorkspace, seedUser } from './_seed';

async function setup() {
  const db = await createPgliteDb();
  const user = await seedUser(db);
  const biz = await seedBizProfile(db, { bizNo: '1234567890' });
  const ws = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
  const repo = new DrizzleRfpRepository(db);
  return { db, repo, user, biz, ws };
}

function makeRfp(
  code: string,
  buyerWsId: string,
  createdBy: string,
  status: RFP['status'] = 'draft',
  allowedPgWorkspaceIds: string[] = [],
): RFP {
  return {
    id: randomUUID(),
    code,
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
    allowedPgWorkspaceIds,
    requiredPaymentMethods: [],
    customPaymentMethods: [],
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

  it('round-trips contractType via save/findById', async () => {
    const rfp: RFP = { ...makeRfp('P-2605-CTYPE1', ctx.ws.id, ctx.user.id), contractType: 'renewal' };
    await repo.save(rfp);
    const fetched = await repo.findById(rfp.id);
    expect(fetched!.contractType).toBe('renewal');
  });

  it('round-trips contractType=new via save/findByCode', async () => {
    const rfp: RFP = { ...makeRfp('P-2605-CTYPE2', ctx.ws.id, ctx.user.id), contractType: 'new' };
    await repo.save(rfp);
    const fetched = await repo.findByCode('P-2605-CTYPE2');
    expect(fetched!.contractType).toBe('new');
  });

  it('round-trips currentFeeVisibleToPg=false via save/findById', async () => {
    const rfp: RFP = {
      ...makeRfp('P-2605-FEEVIS1', ctx.ws.id, ctx.user.id),
      currentFeeVisibleToPg: false,
    };
    await repo.save(rfp);
    const fetched = await repo.findById(rfp.id);
    expect(fetched!.currentFeeVisibleToPg).toBe(false);
  });

  it('re-save does not clobber a persisted currentFeeVisibleToPg=false (conflict-set 제외 불변식)', async () => {
    const rfp: RFP = {
      ...makeRfp('P-2605-FEEVIS3', ctx.ws.id, ctx.user.id),
      currentFeeVisibleToPg: false,
    };
    await repo.save(rfp);
    // 일반 저장/수정(노출=true)이 구매사의 비공개 선택을 덮어쓰면 안 된다.
    await repo.save({ ...rfp, currentFeeVisibleToPg: true, title: 'edited' });
    const fetched = await repo.findById(rfp.id);
    expect(fetched!.currentFeeVisibleToPg).toBe(false);
    expect(fetched!.title).toBe('edited');
  });

  it('currentFeeVisibleToPg defaults to true when omitted', async () => {
    const rfp = makeRfp('P-2605-FEEVIS2', ctx.ws.id, ctx.user.id);
    await repo.save(rfp);
    const fetched = await repo.findByCode('P-2605-FEEVIS2');
    expect(fetched!.currentFeeVisibleToPg).toBe(true);
  });

  it('saves and retrieves by uuid id', async () => {
    const rfp = makeRfp('P-2605-0001', ctx.ws.id, ctx.user.id);
    await repo.save(rfp);
    const fetched = await repo.findById(rfp.id);
    expect(fetched).toMatchObject({ id: rfp.id, code: 'P-2605-0001', status: 'draft' });
    expect(fetched!.bizProfile?.bizNo).toBe('1234567890');
  });

  it('findByCode retrieves by human code', async () => {
    const rfp = makeRfp('P-2605-0042', ctx.ws.id, ctx.user.id);
    await repo.save(rfp);
    const fetched = await repo.findByCode('P-2605-0042');
    expect(fetched).toMatchObject({ id: rfp.id, code: 'P-2605-0042' });
  });

  it('returns undefined for unknown id and code', async () => {
    expect(await repo.findById(randomUUID())).toBeUndefined();
    expect(await repo.findByCode('Q-NONE')).toBeUndefined();
  });

  it('round-trips the allowlist via rfp_allowed_pg', async () => {
    const pg1 = await seedPgWorkspace(db, 'Toss');
    const pg2 = await seedPgWorkspace(db, 'Inicis');
    const rfp = makeRfp('P-2605-0003', ctx.ws.id, ctx.user.id, 'draft', [pg1.id, pg2.id]);
    await repo.save(rfp);
    const fetched = await repo.findById(rfp.id);
    expect(fetched!.allowedPgWorkspaceIds.sort()).toEqual([pg1.id, pg2.id].sort());
  });

  it('save replaces the allowlist on upsert', async () => {
    const pg1 = await seedPgWorkspace(db, 'Toss');
    const pg2 = await seedPgWorkspace(db, 'Inicis');
    const rfp = makeRfp('P-2605-0004', ctx.ws.id, ctx.user.id, 'draft', [pg1.id]);
    await repo.save(rfp);
    await repo.save({ ...rfp, allowedPgWorkspaceIds: [pg2.id] });
    const fetched = await repo.findById(rfp.id);
    expect(fetched!.allowedPgWorkspaceIds).toEqual([pg2.id]);
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
    const rfp = makeRfp('P-2605-0001', ctx.ws.id, ctx.user.id);
    await repo.save(rfp);
    const updated = await repo.transition(rfp.id, 'sent');
    expect(updated.status).toBe('sent');
  });

  it('throws on invalid transition (draft → awarded)', async () => {
    const rfp = makeRfp('P-2605-0001', ctx.ws.id, ctx.user.id);
    await repo.save(rfp);
    await expect(repo.transition(rfp.id, 'awarded')).rejects.toThrow(
      'Invalid RFP transition',
    );
  });

  it('throws when RFP not found', async () => {
    await expect(repo.transition(randomUUID(), 'sent')).rejects.toThrow('not found');
  });

  it('round-trips the 6 new optional fields', async () => {
    const rfp: RFP = {
      ...makeRfp('P-2605-0099', ctx.ws.id, ctx.user.id),
      websiteUrl: 'https://supporter-b.com/',
      mainProducts: '의류',
      annualPgVolume: '10억',
      currentFeeRate: '3.4%',
      currentSettlementLimit: '월 1억',
      currentGuaranteeInsurance: '3000만원',
    };
    await repo.save(rfp);
    const fetched = await repo.findById(rfp.id);
    expect(fetched!.websiteUrl).toBe('https://supporter-b.com/');
    expect(fetched!.mainProducts).toBe('의류');
    expect(fetched!.annualPgVolume).toBe('10억');
    expect(fetched!.currentFeeRate).toBe('3.4%');
    expect(fetched!.currentSettlementLimit).toBe('월 1억');
    expect(fetched!.currentGuaranteeInsurance).toBe('3000만원');
  });

  it('omitted optional fields hydrate as undefined', async () => {
    const rfp = makeRfp('P-2605-0100', ctx.ws.id, ctx.user.id);
    await repo.save(rfp);
    const fetched = await repo.findById(rfp.id);
    expect(fetched!.websiteUrl).toBeUndefined();
    expect(fetched!.mainProducts).toBeUndefined();
    expect(fetched!.annualPgVolume).toBeUndefined();
    expect(fetched!.currentFeeRate).toBeUndefined();
    expect(fetched!.currentSettlementLimit).toBeUndefined();
    expect(fetched!.currentGuaranteeInsurance).toBeUndefined();
  });

  it('concurrent transition: only one of two parallel sent->closed wins', async () => {
    const rfp = makeRfp('P-2605-0010', ctx.ws.id, ctx.user.id, 'sent');
    await repo.save(rfp);
    const results = await Promise.allSettled([
      repo.transition(rfp.id, 'closed'),
      repo.transition(rfp.id, 'cancelled'),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const reason = (rejected[0] as PromiseRejectedResult).reason as Error;
    expect(reason.message).toMatch(/Invalid RFP transition|lost a race/);
  });

  // ─── Phase 2C gap methods ─────────────────────────────────────────────

  describe('setBoardVisible', () => {
    it('toggles board_visible off then on', async () => {
      const rfp = makeRfp('P-2605-BV01', ctx.ws.id, ctx.user.id);
      await repo.save(rfp);
      // default true
      expect((await repo.findById(rfp.id))!.boardVisible).toBe(true);
      await repo.setBoardVisible(rfp.id, false);
      expect((await repo.findById(rfp.id))!.boardVisible).toBe(false);
      await repo.setBoardVisible(rfp.id, true);
      expect((await repo.findById(rfp.id))!.boardVisible).toBe(true);
    });
  });

  describe('updateDeadline', () => {
    it('replaces the deadline without touching status', async () => {
      const rfp = makeRfp('P-2605-DL01', ctx.ws.id, ctx.user.id, 'sent');
      await repo.save(rfp);
      const next = new Date('2030-01-02T03:04:05.000Z');
      await repo.updateDeadline(rfp.id, next);
      const fetched = await repo.findById(rfp.id);
      expect(fetched!.deadline).toBe(next.toISOString());
      expect(fetched!.status).toBe('sent');
    });
  });

  describe('findIdAndOwnerByCode', () => {
    it('returns id + buyerWsId for a known code', async () => {
      const rfp = makeRfp('P-2605-OWN1', ctx.ws.id, ctx.user.id);
      await repo.save(rfp);
      const res = await repo.findIdAndOwnerByCode('P-2605-OWN1');
      expect(res).toEqual({ id: rfp.id, buyerWsId: ctx.ws.id });
    });

    it('returns undefined for an unknown code', async () => {
      expect(await repo.findIdAndOwnerByCode('P-2605-NONE')).toBeUndefined();
    });
  });

  describe('findOwnerById', () => {
    it('returns buyerWsId for a known id', async () => {
      const rfp = makeRfp('P-2605-OWN2', ctx.ws.id, ctx.user.id);
      await repo.save(rfp);
      expect(await repo.findOwnerById(rfp.id)).toEqual({ buyerWsId: ctx.ws.id });
    });

    it('returns undefined for an unknown id', async () => {
      expect(await repo.findOwnerById(randomUUID())).toBeUndefined();
    });
  });

  describe('reserveNextCode', () => {
    it('issues P-YYMM-0001 on first call and increments per month', async () => {
      expect(await repo.reserveNextCode('2605')).toBe('P-2605-0001');
      expect(await repo.reserveNextCode('2605')).toBe('P-2605-0002');
      // independent counter per year-month
      expect(await repo.reserveNextCode('2606')).toBe('P-2606-0001');
    });
  });

  describe('searchForBuyer', () => {
    it('returns whitelisted projection for ilike matches, scoped to ws', async () => {
      await repo.save({ ...makeRfp('P-2605-SR01', ctx.ws.id, ctx.user.id), title: 'Alpha 견적' });
      await repo.save({ ...makeRfp('P-2605-SR02', ctx.ws.id, ctx.user.id), title: 'Beta 견적' });
      // other ws — must be excluded
      const otherBiz = await seedBizProfile(db, { bizNo: '8888888888' });
      const otherWs = await seedBuyerWorkspace(db, { bizProfileId: otherBiz.id });
      await repo.save({
        ...makeRfp('P-2605-SR03', otherWs.id, ctx.user.id),
        title: 'Alpha other',
        bizProfile: { bizNo: '8888888888', taxType: 'general', status: 'active', gradeSource: 'user_confirmed' },
      });

      const rows = (await repo.searchForBuyer(ctx.ws.id, '%Alpha%')) as {
        code: string;
        title: string;
        memo: string;
        status: string;
      }[];
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({
        code: 'P-2605-SR01',
        title: 'Alpha 견적',
        memo: '',
        status: 'draft',
      });
    });

    it('matches on memo as well as title', async () => {
      await repo.save({ ...makeRfp('P-2605-SR04', ctx.ws.id, ctx.user.id), title: 'T', memo: 'needle' });
      const rows = (await repo.searchForBuyer(ctx.ws.id, '%needle%')) as { code: string }[];
      expect(rows.map((r) => r.code)).toEqual(['P-2605-SR04']);
    });
  });
});
