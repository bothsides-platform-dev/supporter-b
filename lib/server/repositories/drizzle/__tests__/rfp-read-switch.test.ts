import { describe, expect, it, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { rfps } from '@/lib/db/schema';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { DrizzleRfpRepository } from '../rfp';
import { seedBizProfile, seedBuyerWorkspace, seedUser } from './_seed';

async function setup() {
  const db = await createPgliteDb();
  const user = await seedUser(db);
  const biz = await seedBizProfile(db, { bizNo: '1234567890' });
  const ws = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
  const repo = new DrizzleRfpRepository(db);
  return { db, repo, user, ws };
}

describe('rowToRfp 읽기 전환 (Phase D)', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  let repo: DrizzleRfpRepository;
  let db: PgliteDB;

  beforeEach(async () => {
    ctx = await setup();
    repo = ctx.repo;
    db = ctx.db;
  });

  it('현재조건을 current_terms 문서에서 읽는다 (개별컬럼이 비어 있어도)', async () => {
    // 개별컬럼 NULL, 문서에만 값 — 읽기 권위가 문서로 넘어왔는지 검증.
    const id = randomUUID();
    await db.insert(rfps).values({
      id,
      code: 'P-2605-RD1',
      buyerWsId: ctx.ws.id,
      title: 't',
      deadline: new Date(Date.now() + 86_400_000),
      createdBy: ctx.user.id,
      currentTerms: {
        _v: 1,
        feeRate: '7.7%',
        settlementCycle: 'W+2',
        solution: 'cafe24',
        annualPgVolume: '월 9억',
      },
    });
    const fetched = await repo.findById(id);
    expect(fetched!.currentFeeRate).toBe('7.7%');
    expect(fetched!.currentSettlementCycle).toBe('W+2');
    expect(fetched!.currentSolution).toBe('cafe24');
    expect(fetched!.annualPgVolume).toBe('월 9억');
  });

  it('문서가 비어 있으면 개별컬럼으로 폴백한다 (전이기 안전)', async () => {
    // 백필 전 레거시 행: 문서 기본값(빈) + 개별컬럼 값.
    const id = randomUUID();
    await db.insert(rfps).values({
      id,
      code: 'P-2605-RD2',
      buyerWsId: ctx.ws.id,
      title: 't',
      deadline: new Date(Date.now() + 86_400_000),
      createdBy: ctx.user.id,
      currentFeeRate: '3.4%',
      currentSettlementLimit: '월 1억',
    });
    const fetched = await repo.findById(id);
    expect(fetched!.currentFeeRate).toBe('3.4%');
    expect(fetched!.currentSettlementLimit).toBe('월 1억');
  });

  it('문서와 개별컬럼이 모두 있으면 문서 값이 이긴다 (읽기 권위 = 문서)', async () => {
    // Phase D 핵심 보장: terms.X ?? row.currentX — 둘 다 있을 때 문서가 우선.
    // 불일치 값으로 머지 순서를 못박는다(컬럼-우선 회귀를 잡는다).
    const id = randomUUID();
    await db.insert(rfps).values({
      id,
      code: 'P-2605-RD4',
      buyerWsId: ctx.ws.id,
      title: 't',
      deadline: new Date(Date.now() + 86_400_000),
      createdBy: ctx.user.id,
      currentFeeRate: '3.4%', // 개별컬럼
      currentSettlementCycle: 'D+1',
      currentTerms: { _v: 1, feeRate: '7.7%', settlementCycle: 'W+2' }, // 문서(불일치)
    });
    const fetched = await repo.findById(id);
    expect(fetched!.currentFeeRate).toBe('7.7%');
    expect(fetched!.currentSettlementCycle).toBe('W+2');
  });

  it('hiddenFromPg 를 RFP 에 노출한다', async () => {
    const id = randomUUID();
    await db.insert(rfps).values({
      id,
      code: 'P-2605-RD3',
      buyerWsId: ctx.ws.id,
      title: 't',
      deadline: new Date(Date.now() + 86_400_000),
      createdBy: ctx.user.id,
      hiddenFromPg: ['currentTerms.feeRate'],
    });
    const fetched = await repo.findById(id);
    expect(fetched!.hiddenFromPg).toEqual(['currentTerms.feeRate']);
  });
});
