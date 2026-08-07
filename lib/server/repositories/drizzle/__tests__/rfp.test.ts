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

  // Batch read. findById costs TWO queries (row join + allowlist), so callers
  // resolving a list of rfp ids one at a time paid 2N. This pays 2 flat.
  describe('findByIds', () => {
    it('returns every requested rfp, hydrated like findById', async () => {
      const a: RFP = { ...makeRfp('P-2605-BAT01', ctx.ws.id, ctx.user.id), contractType: 'renewal' };
      const b: RFP = { ...makeRfp('P-2605-BAT02', ctx.ws.id, ctx.user.id), contractType: 'new' };
      await repo.save(a);
      await repo.save(b);

      const rows = await repo.findByIds([a.id, b.id]);

      expect(rows).toHaveLength(2);
      const byId = new Map(rows.map((r) => [r.id, r]));
      expect(byId.get(a.id)!.code).toBe('P-2605-BAT01');
      expect(byId.get(a.id)!.contractType).toBe('renewal');
      expect(byId.get(b.id)!.contractType).toBe('new');
    });

    it('hydrates allowedPgWorkspaceIds per rfp, not merged across them', async () => {
      const pgA = await seedPgWorkspace(db, 'a.im');
      const pgB = await seedPgWorkspace(db, 'b.im');
      const a: RFP = {
        ...makeRfp('P-2605-BAT03', ctx.ws.id, ctx.user.id, 'draft', [pgA.id]),
      };
      const b: RFP = {
        ...makeRfp('P-2605-BAT04', ctx.ws.id, ctx.user.id, 'draft', [pgB.id]),
      };
      await repo.save(a);
      await repo.save(b);

      const rows = await repo.findByIds([a.id, b.id]);
      const byId = new Map(rows.map((r) => [r.id, r]));

      expect(byId.get(a.id)!.allowedPgWorkspaceIds).toEqual([pgA.id]);
      expect(byId.get(b.id)!.allowedPgWorkspaceIds).toEqual([pgB.id]);
    });

    it('omits ids that do not exist', async () => {
      const a: RFP = makeRfp('P-2605-BAT05', ctx.ws.id, ctx.user.id);
      await repo.save(a);

      const rows = await repo.findByIds([a.id, randomUUID()]);

      expect(rows.map((r) => r.id)).toEqual([a.id]);
    });

    it('returns [] for an empty id list without querying', async () => {
      await expect(repo.findByIds([])).resolves.toEqual([]);
    });
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

  it('transition() sets updatedAt to the transition time, distinct from creation time', async () => {
    const rfp = makeRfp('P-2605-0099', ctx.ws.id, ctx.user.id);
    await repo.save(rfp);
    const saved = await repo.findById(rfp.id);
    await new Promise<void>((r) => setTimeout(r, 10));
    const updated = await repo.transition(rfp.id, 'sent');
    expect(new Date(updated.updatedAt!).getTime()).toBeGreaterThan(
      new Date(saved!.updatedAt!).getTime(),
    );
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
      websiteUrl: 'https://support-b.com/',
      mainProducts: '의류',
      annualPgVolume: '10억',
      currentFeeRate: '3.4%',
      currentSettlementLimit: '월 1억',
      currentGuaranteeInsurance: '3000만원',
    };
    await repo.save(rfp);
    const fetched = await repo.findById(rfp.id);
    expect(fetched!.websiteUrl).toBe('https://support-b.com/');
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

  describe('listForBuyer', () => {
    it('returns the same whitelisted projection as searchForBuyer, ws-scoped, no ilike, ordered desc(createdAt), capped by limit', async () => {
      await repo.save({ ...makeRfp('P-2605-LB01', ctx.ws.id, ctx.user.id), title: 'first' });
      await repo.save({ ...makeRfp('P-2605-LB02', ctx.ws.id, ctx.user.id), title: 'second', memo: 'm2' });
      // other ws — must be excluded
      const otherBiz = await seedBizProfile(db, { bizNo: '8888888888' });
      const otherWs = await seedBuyerWorkspace(db, { bizProfileId: otherBiz.id });
      await repo.save({
        ...makeRfp('P-2605-LB03', otherWs.id, ctx.user.id),
        title: 'other ws',
        bizProfile: { bizNo: '8888888888', taxType: 'general', status: 'active', gradeSource: 'user_confirmed' },
      });

      const rows = (await repo.listForBuyer(ctx.ws.id, 10)) as {
        code: string;
        title: string;
        memo: string;
        status: string;
      }[];
      // no ilike — both ws rows returned
      expect(rows).toHaveLength(2);
      // projection keys exactly match searchForBuyer
      expect(Object.keys(rows[0]).sort()).toEqual(['code', 'memo', 'status', 'title']);
      expect(rows.map((r) => r.code).sort()).toEqual(['P-2605-LB01', 'P-2605-LB02']);
      const second = rows.find((r) => r.code === 'P-2605-LB02')!;
      expect(second).toEqual({ code: 'P-2605-LB02', title: 'second', memo: 'm2', status: 'draft' });
    });

    it('respects the limit param', async () => {
      await repo.save({ ...makeRfp('P-2605-LB04', ctx.ws.id, ctx.user.id), title: 'a' });
      await repo.save({ ...makeRfp('P-2605-LB05', ctx.ws.id, ctx.user.id), title: 'b' });
      await repo.save({ ...makeRfp('P-2605-LB06', ctx.ws.id, ctx.user.id), title: 'c' });
      const rows = (await repo.listForBuyer(ctx.ws.id, 2)) as unknown[];
      expect(rows).toHaveLength(2);
    });
  });

  describe('insertNew', () => {
    it('inserts all RFP fields verbatim (createRfp path) and reads back via findById', async () => {
      const sentAt = new Date('2026-01-02T03:04:00Z');
      const deadline = new Date(Date.now() + 86_400_000);
      const id = randomUUID();
      await repo.insertNew({
        id,
        code: 'P-2605-NEW1',
        buyerWsId: ctx.ws.id,
        bizProfileId: ctx.biz.id,
        title: '신규 견적',
        memo: '메모',
        websiteUrl: 'https://shop.example.com',
        mainProducts: '패션 잡화',
        annualPgVolume: '10억',
        currentFeeRate: '3.4%',
        currentSettlementLimit: '월 1억',
        currentGuaranteeInsurance: '3000만원',
        currentSettlementCycle: 'D+1',
        deliveryServicePeriod: 'D+3',
        boardVisible: false,
        currentFeeVisibleToPg: false,
        contractType: 'renewal',
        currentSolution: 'self',
        currentSolutionDetail: 'ABC몰',
        deadline,
        status: 'sent',
        requiredPaymentMethods: ['card', 'bank_transfer'],
        customPaymentMethods: [{ id: 'cpm-1', label: '포인트결제' }],
        createdBy: ctx.user.id,
        sentAt,
      });

      const fetched = await repo.findById(id);
      expect(fetched).toBeDefined();
      expect(fetched!.code).toBe('P-2605-NEW1');
      expect(fetched!.title).toBe('신규 견적');
      expect(fetched!.memo).toBe('메모');
      expect(fetched!.websiteUrl).toBe('https://shop.example.com');
      expect(fetched!.mainProducts).toBe('패션 잡화');
      expect(fetched!.annualPgVolume).toBe('10억');
      expect(fetched!.currentFeeRate).toBe('3.4%');
      expect(fetched!.currentSettlementLimit).toBe('월 1억');
      expect(fetched!.currentGuaranteeInsurance).toBe('3000만원');
      expect(fetched!.currentSettlementCycle).toBe('D+1');
      expect(fetched!.deliveryServicePeriod).toBe('D+3');
      expect(fetched!.boardVisible).toBe(false);
      expect(fetched!.currentFeeVisibleToPg).toBe(false);
      expect(fetched!.contractType).toBe('renewal');
      expect(fetched!.currentSolution).toBe('self');
      expect(fetched!.currentSolutionDetail).toBe('ABC몰');
      expect(fetched!.status).toBe('sent');
      expect(fetched!.requiredPaymentMethods).toEqual(['card', 'bank_transfer']);
      expect(fetched!.customPaymentMethods).toEqual([{ id: 'cpm-1', label: '포인트결제' }]);
      expect(fetched!.createdBy).toBe(ctx.user.id);
      expect(fetched!.sentAt).toBe(sentAt.toISOString());
    });

    it('stores null bizProfileId / null optional fields when omitted', async () => {
      const id = randomUUID();
      await repo.insertNew({
        id,
        code: 'P-2605-NEW2',
        buyerWsId: ctx.ws.id,
        bizProfileId: null,
        title: '미니 견적',
        memo: '',
        websiteUrl: null,
        mainProducts: null,
        annualPgVolume: null,
        currentFeeRate: null,
        currentSettlementLimit: null,
        currentGuaranteeInsurance: null,
        currentSettlementCycle: null,
        deliveryServicePeriod: null,
        boardVisible: true,
        currentFeeVisibleToPg: true,
        contractType: null,
        currentSolution: null,
        currentSolutionDetail: null,
        deadline: new Date(Date.now() + 86_400_000),
        status: 'draft',
        requiredPaymentMethods: [],
        customPaymentMethods: [],
        createdBy: ctx.user.id,
        sentAt: null,
      });

      const fetched = await repo.findById(id);
      expect(fetched).toBeDefined();
      expect(fetched!.bizProfile).toBeUndefined();
      expect(fetched!.websiteUrl).toBeUndefined();
      expect(fetched!.currentSettlementCycle).toBeUndefined();
      expect(fetched!.contractType).toBeNull();
      expect(fetched!.status).toBe('draft');
      expect(fetched!.sentAt).toBeUndefined();
    });
  });
});
