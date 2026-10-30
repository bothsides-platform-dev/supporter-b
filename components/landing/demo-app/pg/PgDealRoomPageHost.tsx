'use client';

import { PgDealRoomBody } from '@/components/deal-room/pg/PgDealRoomBody';
import type { PgDealRoomLinkTab } from '@/lib/rfp/pg-deal-room-link';
import { demoPgDealData } from './pg-demo-fixtures';

// 데모 딜룸 — 실제 PG 딜룸 본문(PgDealRoomBody)을 fixture 로 그대로 구동한다.
// 요청 정보·견적 작업 패널과 좁은 화면의 탭이 실제 화면과 같은 코드에서
// 나오므로 여기서 갈라질 수 없다. 게스트 제출만 서버 액션 대신 가입으로 빠진다.
export function PgDealRoomPageHost({ onGuestSubmit, initialTab }: { initialTab?: PgDealRoomLinkTab; onGuestSubmit: () => void }) {
  return (
    <div className="h-full min-h-0">
      <PgDealRoomBody data={demoPgDealData} initialTab={initialTab} onGuestSubmit={onGuestSubmit} />
    </div>
  );
}
