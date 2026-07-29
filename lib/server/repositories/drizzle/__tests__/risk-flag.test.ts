// DrizzleRiskFlagRepository — 운영자(admin 콘솔)용 durable 위험 플래그.
// 국세청 장애로 사업자번호를 검증하지 못한 채 통과한 가입건에 'biz_unverified'
// 플래그를 남겨, 승인 심사에서 수동 확인이 필요하다는 사실이 유실되지 않게 한다.
import { beforeEach, describe, expect, it } from 'vitest';

import { createPgliteDb } from '@/lib/db/client-pglite';
import { DrizzleRiskFlagRepository } from '../risk-flag';

const WS_ID = '11111111-1111-4111-8111-111111111111';

async function setup() {
  const db = await createPgliteDb();
  return { db, repo: new DrizzleRiskFlagRepository(db) };
}

describe('DrizzleRiskFlagRepository', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });

  it('raise() 가 플래그를 남기고 findByEntity() 로 읽힌다', async () => {
    await ctx.repo.raise({
      entityType: 'workspace',
      entityId: WS_ID,
      flagType: 'biz_unverified',
      severity: 'warning',
    });

    const flags = await ctx.repo.findByEntity('workspace', WS_ID);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({
      entityType: 'workspace',
      entityId: WS_ID,
      flagType: 'biz_unverified',
      severity: 'warning',
      resolvedAt: null,
    });
  });

  it('다른 엔티티의 플래그는 섞이지 않는다', async () => {
    await ctx.repo.raise({
      entityType: 'workspace',
      entityId: WS_ID,
      flagType: 'biz_unverified',
      severity: 'warning',
    });

    expect(
      await ctx.repo.findByEntity('workspace', '22222222-2222-4222-8222-222222222222'),
    ).toEqual([]);
  });

  it('플래그가 없으면 빈 배열을 돌려준다', async () => {
    expect(await ctx.repo.findByEntity('workspace', WS_ID)).toEqual([]);
  });
});
