'use client';

import { PgDealRoomBody } from '@/components/deal-room/pg/PgDealRoomBody';
import { demoPgDealData } from './pg-demo-fixtures';

// 데모 딜룸 — 실제 PG 딜룸 본문(PgDealRoomBody)을 fixture 로 그대로 구동한다.
// 탭 구성(요청 조건 · 견적 작성 · 첨부)·라벨·기본 탭이 실제 화면과 같은 코드에서
// 나오므로 여기서 갈라질 수 없다. 게스트 제출만 서버 액션 대신 가입으로 빠진다.
export function PgDealRoomPageHost({ onGuestSubmit }: { onGuestSubmit: () => void }) {
  return (
    <div className="h-full min-h-0">
      <PgDealRoomBody data={demoPgDealData} onGuestSubmit={onGuestSubmit} />
    </div>
  );
}
