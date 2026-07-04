'use client';

// 가상 샘플 온보딩 — 구매사 딜룸 본문. BuyerDealRoomBody 와 같은 역할(딜룸 셸의
// children) 이라 이 컴포넌트 자체는 DealRoomFull/DealRoomModal 을 포함하지 않는다 —
// 페이지(app/(app)/rfp/[id], app/(app)/rfp/@modal/(.)[id])가 실제 딜룸과 동일하게
// 감싼다. 채팅은 없다(실제 상대가 없으므로). '가짜 선정'은 FocusComparison 의
// onSampleAward 로 실제 awardRfpAction/AwardConfirmDialog 를 완전히 우회하고, 선정
// 즉시 이 컴포넌트가 소유한 로컬 축하 오버레이로 전환한다.
//
// 축하 오버레이는 AwardResult.tsx(PR#148, 실제 선정 축하)를 그대로 마운트하지 않는다 —
// 그 컴포넌트의 CTA 는 getOrCreateConversationAction(pgWsId) 로 실제 DB 대화를 만드는데,
// 샘플 pgWsId 는 존재하지 않는 워크스페이스라 그 호출이 깨진다. 대신 AwardResult 와
// SamplePgAwardCelebration(PG 샘플 축하)이 이미 공유하는 시각 셸(useCelebrationConfetti +
// 카드형 레이아웃)을 세 번째로 재구성한다 — 이 파일 안의 3번째 합성이 그 컨벤션을 따른다.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { motion } from 'motion/react';
import { Button } from '@/components/primitives/Button';
import { FocusComparison } from '@/components/rfp/comparison/FocusComparison';
import { useCelebrationConfetti } from '@/lib/hooks/useCelebrationConfetti';
import { updateOnboardingAction } from '@/lib/server/actions/onboarding/updateOnboardingAction';
import { SampleExperienceBanner } from './SampleExperienceBanner';
import {
  sampleBids,
  sampleBuyerRfp,
  samplePgLogoUpdatedAtMap,
  samplePgNames,
} from '@/lib/onboarding/fixtures';

function SampleBuyerAwardCelebration({ pgName, onDone }: { pgName: string; onDone: () => void }) {
  const { canvasRef } = useCelebrationConfetti();
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--md-sys-color-surface)] px-6">
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 h-full w-full"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
        className="relative z-10 flex w-full max-w-[480px] flex-col items-center gap-6 text-center"
      >
        <span className="inline-flex size-14 items-center justify-center rounded-full bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]">
          <Check className="size-8" strokeWidth={2} />
        </span>
        <div className="flex flex-col items-center gap-1.5">
          <h1 className="text-title-large">{pgName}을 선정했어요</h1>
          <p className="text-body-medium text-on-surface-variant">
            실제 요청에서는 선정 즉시 PG에게 알림이 가요.
          </p>
        </div>
        <Button onClick={onDone}>둘러보기 끝내기</Button>
      </motion.div>
    </div>
  );
}

export function SampleBuyerDealRoom() {
  const router = useRouter();
  const [awardedBidId, setAwardedBidId] = useState<string | null>(null);

  const onSampleAward = (bidId: string) => {
    setAwardedBidId(bidId);
    void updateOnboardingAction({ key: 'buyerSample', event: 'completed' });
  };

  const awardedBid = sampleBids.find((b) => b.id === awardedBidId);

  return (
    <>
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 px-6 pt-4">
          <SampleExperienceBanner variant="buyer" completed={!!awardedBidId} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <FocusComparison
            bids={sampleBids}
            pgWsNameMap={samplePgNames}
            pgWsLogoUpdatedAtMap={samplePgLogoUpdatedAtMap}
            current={{
              feeRate: sampleBuyerRfp.currentFeeRate,
              settlementCycle: sampleBuyerRfp.currentSettlementCycle,
              settlementLimit: sampleBuyerRfp.currentSettlementLimit,
              guaranteeInsurance: sampleBuyerRfp.currentGuaranteeInsurance,
            }}
            rfpStatus={sampleBuyerRfp.status}
            requiredPaymentMethods={sampleBuyerRfp.requiredPaymentMethods}
            customPaymentMethods={sampleBuyerRfp.customPaymentMethods}
            rfpId={sampleBuyerRfp.id}
            rfpCode={sampleBuyerRfp.code}
            isSample
            onSampleAward={onSampleAward}
          />
        </div>
      </div>
      {awardedBid && (
        <SampleBuyerAwardCelebration
          pgName={samplePgNames[awardedBid.pgWsId] ?? awardedBid.pgWsId}
          onDone={() => router.push('/rfp')}
        />
      )}
    </>
  );
}
