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

  it('hiddenFromPg 를 RFP 에 노출하고 currentFeeVisibleToPg 를 거기서 파생한다', async () => {
    // currentFeeVisibleToPg 컬럼은 안 건드림(기본 true) — hidden_from_pg 가 권위.
    // 컬럼이 곧 제거되므로 가시성은 hidden_from_pg 에서 파생되어야 한다.
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
    expect(fetched!.currentFeeVisibleToPg).toBe(false);
  });

  it('hidden_from_pg 가 비면 currentFeeVisibleToPg=true (파생)', async () => {
    const id = randomUUID();
    await db.insert(rfps).values({
      id,
      code: 'P-2605-RD7',
      buyerWsId: ctx.ws.id,
      title: 't',
      deadline: new Date(Date.now() + 86_400_000),
      createdBy: ctx.user.id,
    });
    const fetched = await repo.findById(id);
    expect(fetched!.currentFeeVisibleToPg).toBe(true);
  });
});
