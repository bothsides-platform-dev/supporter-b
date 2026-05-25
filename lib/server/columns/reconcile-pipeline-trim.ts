// 일회성·idempotent: 기존 워크스페이스의 레거시 6단계 파이프라인 컬럼을 트림된
// 집합으로 정리한다. (신규 워크스페이스는 defaultColumns 시드가 이미 새 집합 생성.)
//   buyer: sent → active(진행중); collecting·comparing 컬럼 삭제; 낙찰→계약완료; 종료→마감
//   pg:    reviewing 컬럼 삭제; 수신→신규 라벨
// 파이프라인 카드의 board_column_id 는 거의 항상 null 이고, 컬럼 삭제 시 FK
// ON DELETE SET NULL 로 null 화되어 lifecycleKey 기준 자동 재분류된다.
// 부분 unique index (workspace_id, kind, lifecycle_key) WHERE lifecycle_key IS
// NOT NULL 보존: sent→active 는 워크스페이스당 단 하나의 'active' 만 만든다.
import { and, eq, inArray } from 'drizzle-orm';
import { columns } from '@/lib/db/schema';
import type { Tx } from '@/lib/server/repositories/types';

export async function reconcilePipelineColumnTrim(db: Tx): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const h = db as any;
  // buyer: 발송 컬럼을 진행중으로 전환 (기존 'sent' 행 rename)
  await h
    .update(columns)
    .set({ lifecycleKey: 'active', title: '진행중' })
    .where(and(eq(columns.kind, 'pipeline'), eq(columns.lifecycleKey, 'sent')));
  // buyer: 응답수집·비교협상중 컬럼 삭제 (카드는 active 로 재분류)
  await h
    .delete(columns)
    .where(and(eq(columns.kind, 'pipeline'), inArray(columns.lifecycleKey, ['collecting', 'comparing'])));
  // buyer: 라벨 정렬
  await h
    .update(columns)
    .set({ title: '계약완료' })
    .where(and(eq(columns.kind, 'pipeline'), eq(columns.lifecycleKey, 'awarded')));
  await h
    .update(columns)
    .set({ title: '마감' })
    .where(and(eq(columns.kind, 'pipeline'), eq(columns.lifecycleKey, 'closed')));
  // pg: 검토중 컬럼 삭제 (카드는 received 로 재분류), 수신→신규 라벨
  await h
    .delete(columns)
    .where(and(eq(columns.kind, 'pipeline'), eq(columns.lifecycleKey, 'reviewing')));
  await h
    .update(columns)
    .set({ title: '신규' })
    .where(and(eq(columns.kind, 'pipeline'), eq(columns.lifecycleKey, 'received')));
}
