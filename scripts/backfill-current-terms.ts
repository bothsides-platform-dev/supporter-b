/**
 * scripts/backfill-current-terms.ts — one-shot, idempotent (견적 확장 마이그레이션 Phase C).
 *
 * 기존 RFP 행의 개별 current_* 컬럼을 버전드 문서 `rfps.current_terms` 로 채우고,
 * `current_fee_visible_to_pg=false` 행은 `hidden_from_pg=['currentTerms.feeRate']` 로 일반화한다.
 * 신규 행은 repo dual-write(Phase B)가 이미 동기화하므로 이 스크립트는 레거시 행만 대상.
 *
 * 안전성: id 커서 청크 + 비클로버(이미 문서가 있는 행은 skip) → 재실행 안전.
 * 반드시 Phase D 읽기전환 배포 전에 1회 실행. 실행: `pnpm backfill:current-terms`.
 */
import 'dotenv/config';

import { db } from '@/lib/db/client';
import { DrizzleRfpRepository } from '@/lib/server/repositories/drizzle/rfp';

const CHUNK = 500;

async function main(): Promise<void> {
  const repo = new DrizzleRfpRepository(db);
  let cursor: string | null = null;
  let scannedTotal = 0;
  let updatedTotal = 0;

  for (;;) {
    const res = await repo.backfillCurrentTermsChunk(cursor, CHUNK);
    scannedTotal += res.scanned;
    updatedTotal += res.updated;
    if (res.scanned < CHUNK) break; // 마지막(부분) 청크 — 끝
    cursor = res.lastId;
  }

  console.log(
    `backfill-current-terms: scanned ${scannedTotal}, updated ${updatedTotal}.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
