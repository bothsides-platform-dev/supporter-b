'use client';

import { DealRoomProvider } from '@/components/deal-room/DealRoomContext';
import { FocusComparison } from '@/components/rfp/comparison/FocusComparison';
import { Button } from '@/components/primitives/Button';
import {
  demoCompareBids,
  demoPgNameMap,
  demoCompareCurrent,
  demoBuyerGrade,
} from '../demo-app-fixtures';
import { DemoCue } from '../DemoCue';

const DEMO_METHODS = ['card', 'virtual_account', 'naver_pay'] as const;

// 데모 딜룸 비교 — 실제 FocusComparison을 fixture로. isSample로 선정/재요청 서버액션을
// 비활성화하고, 전환은 별도 가입 배너로 유도한다.
export function DealRoomPageHost({ showCue = false }: { showCue?: boolean }) {
  return (
    <div className="relative flex flex-col gap-4 px-6 py-6">
      <DemoCue show={showCue} label="PG별 견적을 비교하고 선정해요" />
      <DealRoomProvider>
        <FocusComparison
          bids={demoCompareBids}
          pgWsNameMap={demoPgNameMap}
          pgWsLogoUpdatedAtMap={{}}
          current={demoCompareCurrent}
          rfpStatus="sent"
          awardedBidId={null}
          requiredPaymentMethods={DEMO_METHODS}
          customPaymentMethods={[]}
          rfpId="demo-rfp-1"
          rfpCode="P-2606-0042"
          buyerGrade={demoBuyerGrade}
          isSample
        />
      </DealRoomProvider>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] px-4 py-3">
        <span className="text-[var(--text-sm)] text-[var(--md-sys-color-on-surface-variant)]">
          실제로 PG 견적을 받고 이렇게 비교해 선정해보세요.
        </span>
        <Button
          variant="filled"
          size="sm"
          type="button"
          onClick={() => window.location.assign('/signup/buyer')}
        >
          무료로 시작하기 →
        </Button>
      </div>
    </div>
  );
}
