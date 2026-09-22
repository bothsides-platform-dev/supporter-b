'use client';

import { useRouter } from 'next/navigation';
import { DealRoomProvider } from '@/components/deal-room/DealRoomContext';
import { BuyerDealRoomBody } from '@/components/deal-room/buyer/BuyerDealRoomBody';
import { Button } from '@/components/primitives/Button';
import { demoBuyerDealData } from '../demo-app-fixtures';

// 데모 딜룸 — 실제 구매사 딜룸 본문(BuyerDealRoomBody)을 fixture 로 그대로 구동한다.
// 탭(견적 비교 · 요청 조건 · 첨부 · PG 관리)과 좌측 작업 레일이 실제 화면과 같은
// 코드에서 나오므로 여기서 갈라질 수 없다. 선정·재요청 등 쓰기 동작만 서버 액션
// 대신 가입 페이지로 빠진다(onGuestAction) — 무반응 클릭이 되지 않게.
export function DealRoomPageHost() {
  const router = useRouter();
  const goSignup = () => router.push('/signup/buyer');

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <DealRoomProvider>
        <div className="min-h-0 flex-1">
          <BuyerDealRoomBody data={demoBuyerDealData} onGuestAction={goSignup} />
        </div>
      </DealRoomProvider>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] px-4 py-3">
        <span className="text-sm leading-[inherit] text-[var(--md-sys-color-on-surface-variant)]">
          실제로 PG 견적을 받고 이렇게 비교해 선정해보세요.
        </span>
        <Button variant="filled" size="sm" type="button" onClick={goSignup}>
          무료로 시작하기 →
        </Button>
      </div>
    </div>
  );
}
