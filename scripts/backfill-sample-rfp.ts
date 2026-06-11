// 1회성 백필 — 기존 구매사 전부에 샘플 견적 요청을 심는다. 배포 후 수동 실행.
import { db } from '@/lib/db/client';
import { backfillSampleRfps } from '@/lib/server/onboarding/sample-rfp';

async function main() {
  const { seeded } = await backfillSampleRfps(db);
  console.log(`Seeded sample RFP for ${seeded} buyer workspace(s).`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
