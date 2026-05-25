/**
 * scripts/migrate-pipeline-columns-trim.ts — one-shot, idempotent.
 *
 * 기존 워크스페이스의 레거시 6단계 파이프라인 컬럼을 트림된 집합(구매사 4, PG 5)으로
 * 정리. 신규 워크스페이스는 시드(defaultColumns)가 이미 새 집합을 생성한다.
 * Run: tsx scripts/migrate-pipeline-columns-trim.ts
 */
import 'dotenv/config';

import { db } from '@/lib/db/client';
import { reconcilePipelineColumnTrim } from '@/lib/server/columns/reconcile-pipeline-trim';

async function main(): Promise<void> {
  await reconcilePipelineColumnTrim(db);
  console.log('migrate-pipeline-columns-trim: done.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
