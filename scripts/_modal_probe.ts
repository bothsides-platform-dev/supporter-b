// 임시 프로브 — 모달 브라우저 검증용. 검증 후 삭제.
// insert: 활성 브라우저 워크스페이스(dltjddus3)에 검증용 RFP 1건 생성(초대 없음=부수효과 없음).
// delete: 그 RFP 삭제.
import 'dotenv/config';
import { db } from '@/lib/db/client';
import { rfps } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

const WS = '5af03894-ca6f-40bd-a97f-9a79cf3a82a4'; // dltjddus3 buyer ws
const USER = 'fa74f970-a787-44d1-a575-8b96c9af3105';
const CODE = 'P-2605-9001';

async function main() {
  const mode = process.argv[2];
  if (mode === 'delete') {
    await db.delete(rfps).where(eq(rfps.code, CODE));
    console.log('deleted', CODE);
  } else {
    await db.insert(rfps).values({
      id: randomUUID(),
      code: CODE,
      buyerWsId: WS,
      title: '모달 검증용 RFP',
      memo: '',
      deadline: new Date(Date.now() + 7 * 86_400_000),
      status: 'sent',
      createdBy: USER,
      sentAt: new Date(),
    });
    console.log('inserted', CODE);
  }
}

main().then(() => process.exit(0));
