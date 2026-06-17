import { describe, expect, it, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { rfps } from '@/lib/db/schema';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { DrizzleRfpRepository } from '../rfp';
import type { RFP } from '@/lib/types/rfp';
import {
  currentTermsFromDiscrete,
  hiddenFromPgFromVisibility,
} from '@/lib/types/rfp-terms';
import { seedBizProfile, seedBuyerWorkspace, seedUser } from './_seed';

async function setup() {
  const db = await createPgliteDb();
  const user = await seedUser(db);
  const biz = await seedBizProfile(db, { bizNo: '1234567890' });
  const ws = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
  const repo = new DrizzleRfpRepository(db);
  return { db, repo, user, biz, ws };
}

async function rawTerms(db: PgliteDB, id: string) {
  const [row] = await db
    .select({ currentTerms: rfps.currentTerms, hiddenFromPg: rfps.hiddenFromPg })
    .from(rfps)
    .where(eq(rfps.id, id))
    .limit(1);
  return row as { currentTerms: unknown; hiddenFromPg: string[] };
}

describe('rfp dual-write — current_terms / hidden_from_pg 가 개별컬럼과 동기', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  let repo: DrizzleRfpRepository;
  let db: PgliteDB;

  beforeEach(async () => {
    ctx = await setup();
    repo = ctx.repo;
    db = ctx.db;
  });

  it('insertNew: 8개 브리프 필드를 current_terms 문서로 미러링한다', async () => {
    const id = randomUUID();
    const input = {
      currentFeeRate: '3.4%',
      currentSettlementLimit: '월 1억',
      currentGuaranteeInsurance: '3000만원',
      currentSettlementCycle: 'D+1',
      deliveryServicePeriod: 'D+3',
      currentSolution: 'self',
      currentSolutionDetail: 'ABC몰',
      annualPgVolume: '10억',
    };
    await repo.insertNew({
      id,
      code: 'P-2605-DW1',
      buyerWsId: ctx.ws.id,
      bizProfileId: ctx.biz.id,
      title: '신규 견적',
      memo: '',
      websiteUrl: null,
      mainProducts: null,
      boardVisible: true,
      currentFeeVisibleToPg: false,
      contractType: null,
      deadline: new Date(Date.now() + 86_400_000),
      status: 'sent',
      requiredPaymentMethods: [],
      customPaymentMethods: [],
      createdBy: ctx.user.id,
      sentAt: null,
      ...input,
    });

    const raw = await rawTerms(db, id);
    expect(raw.currentTerms).toEqual(currentTermsFromDiscrete(input));
    // currentFeeVisibleToPg=false → feeRate 경로가 숨김 목록에 들어간다.
    expect(raw.hiddenFromPg).toEqual(hiddenFromPgFromVisibility(false));
  });

  it('insertNew: 노출(true)이면 hidden_from_pg 는 빈 배열', async () => {
    const id = randomUUID();
    await repo.insertNew({
      id,
      code: 'P-2605-DW2',
      buyerWsId: ctx.ws.id,
      bizProfileId: null,
      title: 'x',
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
    const raw = await rawTerms(db, id);
    expect(raw.currentTerms).toEqual({ _v: 1 });
    expect(raw.hiddenFromPg).toEqual([]);
  });

  it('save: RFP 브리프 필드를 current_terms 문서로 미러링한다', async () => {
    const rfp: RFP = {
      id: randomUUID(),
      code: 'P-2605-DW3',
      buyerWsId: ctx.ws.id,
      bizProfile: { bizNo: '1234567890', taxType: 'general', status: 'active', grade: 'general', gradeSource: 'user_confirmed' },
      title: 'save 견적',
      memo: '',
      rfpFiles: [],
      allowedPgWorkspaceIds: [],
      requiredPaymentMethods: [],
      customPaymentMethods: [],
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      status: 'draft',
      createdBy: ctx.user.id,
      createdAt: new Date().toISOString(),
      currentFeeRate: '2.0%',
      annualPgVolume: '5억',
      currentFeeVisibleToPg: false,
    };
    await repo.save(rfp);
    const raw = await rawTerms(db, rfp.id);
    expect(raw.currentTerms).toEqual(
      currentTermsFromDiscrete({ currentFeeRate: '2.0%', annualPgVolume: '5억' }),
    );
    expect(raw.hiddenFromPg).toEqual(['currentTerms.feeRate']);
  });

  it('save 재저장: 개별 currentFeeVisibleToPg 불변식처럼 hidden_from_pg 도 비공개 선택을 보존', async () => {
    const base: RFP = {
      id: randomUUID(),
      code: 'P-2605-DW4',
      buyerWsId: ctx.ws.id,
      bizProfile: { bizNo: '1234567890', taxType: 'general', status: 'active', grade: 'general', gradeSource: 'user_confirmed' },
      title: 'x',
      memo: '',
      rfpFiles: [],
      allowedPgWorkspaceIds: [],
      requiredPaymentMethods: [],
      customPaymentMethods: [],
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      status: 'draft',
      createdBy: ctx.user.id,
      createdAt: new Date().toISOString(),
      currentFeeVisibleToPg: false,
    };
    await repo.save(base);
    // 일반 저장/수정(노출=true)이 비공개 선택을 덮어쓰면 안 된다 (conflict-set 제외).
    await repo.save({ ...base, currentFeeVisibleToPg: true, title: 'edited' });
    const raw = await rawTerms(db, base.id);
    expect(raw.hiddenFromPg).toEqual(['currentTerms.feeRate']);
  });
});
