// 1회성 백필 — 기존 PG 전부의 인박스에 온보딩 샘플 견적 요청을 심는다. 배포 후 수동 실행.
import { db } from '@/lib/db/client';
import { backfillSamplePgRfps } from '@/lib/server/onboarding/sample-pg-rfp';

async function main() {
  const { seeded } = await backfillSamplePgRfps(db);
  console.log(`Seeded sample RFP for ${seeded} pg workspace(s).`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
