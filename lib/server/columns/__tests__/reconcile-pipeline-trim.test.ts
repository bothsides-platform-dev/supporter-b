import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { DrizzleColumnRepository } from '@/lib/server/repositories/drizzle/column';
import { reconcilePipelineColumnTrim } from '@/lib/server/columns/reconcile-pipeline-trim';
import { seedBuyerWorkspace } from '@/lib/server/repositories/drizzle/__tests__/_seed';
import type { BoardColumn } from '@/lib/types/column';

// 레거시 키(구매사 6 + PG 6) — 마이그레이션은 워크스페이스 타입과 무관하므로
// 단위 테스트에서는 한 워크스페이스에 공존시켜 키 변환만 검증한다.
// (실제 데이터는 buyer/pg 키가 서로 다른 워크스페이스에 분리되어 있음.)
const LEGACY = [
  'draft', 'sent', 'collecting', 'comparing', 'awarded', 'closed',
  'received', 'reviewing', 'drafting', 'submitted', 'won', 'lost',
] as const;

function legacyCol(wsId: string, key: string, pos: string): BoardColumn {
  return { id: randomUUID(), workspaceId: wsId, kind: 'pipeline', title: key, position: pos, color: null, lifecycleKey: key };
}

function seedLegacy(wsId: string): BoardColumn[] {
  return LEGACY.map((k, i) => legacyCol(wsId, k, `a${i}`));
}

describe('reconcilePipelineColumnTrim', () => {
  it('레거시 파이프라인 컬럼을 트림된 집합으로 정리', async () => {
    const db = await createPgliteDb();
    const ws = await seedBuyerWorkspace(db);
    const repo = new DrizzleColumnRepository(db);
    await repo.createMany(seedLegacy(ws.id));

    await reconcilePipelineColumnTrim(db);

    const after = await repo.listByBoard(ws.id, 'pipeline');
    const byKey = new Map(after.map((c) => [c.lifecycleKey, c.title]));
    expect(byKey.has('sent')).toBe(false);
    expect(byKey.has('collecting')).toBe(false);
    expect(byKey.has('comparing')).toBe(false);
    expect(byKey.has('reviewing')).toBe(false);
    expect(byKey.get('active')).toBe('진행중');
    expect(byKey.get('awarded')).toBe('계약완료');
    expect(byKey.get('closed')).toBe('마감');
    expect(byKey.get('received')).toBe('신규');
    expect(byKey.get('draft')).toBe('draft'); // 미변경
  });

  it('idempotent — 두 번째 실행은 no-op', async () => {
    const db = await createPgliteDb();
    const ws = await seedBuyerWorkspace(db);
    const repo = new DrizzleColumnRepository(db);
    await repo.createMany(seedLegacy(ws.id));

    await reconcilePipelineColumnTrim(db);
    const first = (await repo.listByBoard(ws.id, 'pipeline')).map((c) => c.lifecycleKey).sort();
    await reconcilePipelineColumnTrim(db);
    const second = (await repo.listByBoard(ws.id, 'pipeline')).map((c) => c.lifecycleKey).sort();

    expect(second).toEqual(first);
  });
});
