import { describe, expect, it, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
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

// 마이그레이션 이전 상태(개별컬럼만 채워지고 current_terms 는 기본 빈 문서)를 직접 삽입.
async function insertLegacy(
  db: PgliteDB,
  wsId: string,
  userId: string,
  code: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fields: Record<string, any>,
): Promise<string> {
  const id = randomUUID();
  await db.insert(rfps).values({
    id,
    code,
    buyerWsId: wsId,
    title: 't',
    deadline: new Date(Date.now() + 86_400_000),
    createdBy: userId,
    ...fields,
  });
  return id;
}

async function rawTerms(db: PgliteDB, id: string) {
  const [row] = await db
    .select({ currentTerms: rfps.currentTerms, hiddenFromPg: rfps.hiddenFromPg })
    .from(rfps)
    .where(eq(rfps.id, id))
    .limit(1);
  return row as { currentTerms: unknown; hiddenFromPg: string[] };
}

describe('backfillCurrentTermsChunk', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  let repo: DrizzleRfpRepository;
  let db: PgliteDB;

  beforeEach(async () => {
    ctx = await setup();
    repo = ctx.repo;
    db = ctx.db;
  });

  it('빈 문서 레거시 행을 개별컬럼에서 채운다', async () => {
    const id = await insertLegacy(db, ctx.ws.id, ctx.user.id, 'P-2605-BF1', {
      currentFeeRate: '3.4%',
      currentSettlementCycle: 'D+1',
      currentFeeVisibleToPg: false,
    });
    const res = await repo.backfillCurrentTermsChunk(null, 100);
    expect(res.updated).toBe(1);

    const raw = await rawTerms(db, id);
    expect(raw.currentTerms).toEqual({ _v: 1, feeRate: '3.4%', settlementCycle: 'D+1' });
    expect(raw.hiddenFromPg).toEqual(['currentTerms.feeRate']);
  });

  it('재실행은 멱등 — 이미 채워진 행은 다시 갱신하지 않는다', async () => {
    await insertLegacy(db, ctx.ws.id, ctx.user.id, 'P-2605-BF2', {
      currentFeeRate: '3.4%',
    });
    const first = await repo.backfillCurrentTermsChunk(null, 100);
    expect(first.updated).toBe(1);
    const second = await repo.backfillCurrentTermsChunk(null, 100);
    expect(second.updated).toBe(0);
  });

  it('개별필드 없고 노출=true 인 행은 손대지 않는다(no-op)', async () => {
    await insertLegacy(db, ctx.ws.id, ctx.user.id, 'P-2605-BF3', {});
    const res = await repo.backfillCurrentTermsChunk(null, 100);
    expect(res.scanned).toBe(1);
    expect(res.updated).toBe(0);
  });

  it('id 커서로 청크를 나눠 모든 행을 한 번씩 처리한다', async () => {
    await insertLegacy(db, ctx.ws.id, ctx.user.id, 'P-2605-BF4', { currentFeeRate: 'a' });
    await insertLegacy(db, ctx.ws.id, ctx.user.id, 'P-2605-BF5', { currentFeeRate: 'b' });
    await insertLegacy(db, ctx.ws.id, ctx.user.id, 'P-2605-BF6', { currentFeeRate: 'c' });

    const c1 = await repo.backfillCurrentTermsChunk(null, 2);
    expect(c1.scanned).toBe(2);
    const c2 = await repo.backfillCurrentTermsChunk(c1.lastId, 2);
    expect(c2.scanned).toBe(1);
    const c3 = await repo.backfillCurrentTermsChunk(c2.lastId, 2);
    expect(c3.scanned).toBe(0);
    expect(c1.updated + c2.updated).toBe(3);
  });
});
