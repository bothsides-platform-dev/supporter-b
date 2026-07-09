'use client';

// buyer 튜토리얼(/tutorial) 본체 — 같은 라우트 안에서 phase 전환만으로 "RFP 작성 →
// 견적 도착 연출 → 비교·선정 → 완료" 여정을 가상 체험시킨다(라우트 이동 없음). 실제
// 위저드(RfpCreateWizard)·비교 화면(FocusComparison)을 fixture 데이터로 그대로
// 구동하고, 종결 지점(onSampleSubmit/onSampleAward)만 실제 서버 액션을 우회한다.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/primitives/Button';
import { Divider } from '@/components/primitives/Divider';
import { CoachmarkTour } from '@/components/onboarding/coachmarks';
import { RfpCreateWizard } from '@/components/rfp/RfpCreateWizard';
import { FocusComparison } from '@/components/rfp/comparison/FocusComparison';
import { DealRoomProvider } from '@/components/deal-room/DealRoomContext';
import { BidsArrivalScene } from './BidsArrivalScene';
import { useIsolatedRfpDraft } from './useIsolatedRfpDraft';
import { useTutorialKeyboardLock } from './useTutorialKeyboardLock';
import { buyerCreateTour, buyerArrivalTour, buyerCompareTour } from './tours';
import { useCelebrationConfetti } from '@/lib/hooks/useCelebrationConfetti';
import { updateOnboardingAction } from '@/lib/server/actions/onboarding/updateOnboardingAction';
import {
  tutorialBuyerRfp,
  tutorialBids,
  tutorialPgNames,
  tutorialBuyerName,
  tutorialRfpDraftSeed,
  tutorialBizProfile,
  tutorialPgList,
} from '@/lib/onboarding/tutorial-fixtures';

type Phase = 'create' | 'arrival' | 'compare' | 'done';

const PHASE_ORDER: Phase[] = ['create', 'arrival', 'compare', 'done'];
const PHASE_LABELS: Record<Phase, string> = {
  create: '견적 요청 작성',
  arrival: '견적 도착',
  compare: '견적 비교·선정',
  done: '완료',
};

export function BuyerTutorialFlow() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('create');
  const [createTourDone, setCreateTourDone] = useState(false);
  const [arrivalTourDone, setArrivalTourDone] = useState(false);
  const [compareTourDone, setCompareTourDone] = useState(false);
  const { canvasRef } = useCelebrationConfetti();
  const { restore } = useIsolatedRfpDraft(tutorialRfpDraftSeed);
  // 튜토리얼은 클릭 전용 — 프리필 값을 키보드로 지우거나 덮어쓸 수 없게 잠근다.
  useTutorialKeyboardLock();

  const stepNum = PHASE_ORDER.indexOf(phase) + 1;

  const leaveTutorial = (nextRoute: string) => {
    restore();
    router.push(nextRoute);
  };

  const handleExit = () => {
    void updateOnboardingAction({ key: 'buyerTutorial', event: 'dismissed' });
    leaveTutorial('/home');
  };

  const handleAward = () => {
    void updateOnboardingAction({ key: 'buyerTutorial', event: 'completed' });
    setPhase('done');
  };

  return (
    <div className="flex flex-1 flex-col">
      {/* useCelebrationConfetti 는 캔버스 마운트 시 자동 발사하는 계약(축하 순간에
          마운트되는 화면용) — 상시 마운트하면 튜토리얼 시작 시 터진다. done 에서만. */}
      {phase === 'done' && (
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-50 h-full w-full"
        />
      )}
      <div className="flex items-center justify-between gap-3 border-b border-[var(--md-sys-color-outline-variant)] px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
            {stepNum} / {PHASE_ORDER.length} — {PHASE_LABELS[phase]}
          </span>
          <Divider />
        </div>
        <Button variant="text" size="sm" onClick={handleExit}>
          튜토리얼 나가기
        </Button>
      </div>

      <div className="flex-1 min-h-0">
        {phase === 'create' && (
          <>
            <RfpCreateWizard
              bizProfile={tutorialBizProfile}
              workspaceName={tutorialBuyerName}
              pgList={tutorialPgList}
              onSampleSubmit={() => setPhase('arrival')}
            />
            {/* 단일 연속 투어 — 각 스텝의 다음 버튼(action)을 실제로 클릭하며 제출까지
                이어진다. 마지막 action(제출) 클릭은 onFinish와 phase 전환(onSampleSubmit)을
                동시에 일으키지만 onFinish는 로컬 state만 닫으므로 충돌 없음. */}
            {!createTourDone && (
              <CoachmarkTour steps={buyerCreateTour} onFinish={() => setCreateTourDone(true)} onSkip={() => setCreateTourDone(true)} />
            )}
          </>
        )}

        {phase === 'arrival' && (
          <>
            <BidsArrivalScene
              pgNames={tutorialBids.map((b) => tutorialPgNames[b.pgWsId] ?? b.pgWsId)}
              onProceed={() => setPhase('compare')}
            />
            {/* CTA가 도착 연출 스태거(~1.8s) 후에 등장하므로 기본 3s보다 넉넉히 기다린다. */}
            {!arrivalTourDone && (
              <CoachmarkTour steps={buyerArrivalTour} timeoutMs={5000} onFinish={() => setArrivalTourDone(true)} onSkip={() => setArrivalTourDone(true)} />
            )}
          </>
        )}

        {phase === 'compare' && (
          <DealRoomProvider>
            <div className="px-6 py-6">
              <FocusComparison
                bids={tutorialBids}
                pgWsNameMap={tutorialPgNames}
                pgWsLogoUpdatedAtMap={Object.fromEntries(
                  tutorialBids.map((b) => [b.pgWsId, null]),
                )}
                current={{
                  feeRate: tutorialBuyerRfp.currentFeeRate,
                  settlementCycle: tutorialBuyerRfp.currentSettlementCycle,
                  settlementLimit: tutorialBuyerRfp.currentSettlementLimit,
                  guaranteeInsurance: tutorialBuyerRfp.currentGuaranteeInsurance,
                }}
                rfpStatus={tutorialBuyerRfp.status}
                requiredPaymentMethods={tutorialBuyerRfp.requiredPaymentMethods}
                customPaymentMethods={tutorialBuyerRfp.customPaymentMethods}
                rfpId={tutorialBuyerRfp.id}
                rfpCode={tutorialBuyerRfp.code}
                onSampleAward={handleAward}
              />
            </div>
            {!compareTourDone && (
              <CoachmarkTour steps={buyerCompareTour} onFinish={() => setCompareTourDone(true)} onSkip={() => setCompareTourDone(true)} />
            )}
          </DealRoomProvider>
        )}

        {phase === 'done' && (
          <div className="flex flex-col items-center gap-4 px-8 py-16 text-center">
            <h2 className="text-[20px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
              튜토리얼을 완료했어요
            </h2>
            <p className="text-[14px] text-[var(--md-sys-color-on-surface-variant)]">
              이제 실제 견적 요청을 작성해서 여러 PG사의 견적을 받아보세요.
            </p>
            <div className="flex flex-col gap-2">
              <Button onClick={() => leaveTutorial('/rfp-create')}>실제 견적 요청 보내기</Button>
              <Button variant="outlined" onClick={() => leaveTutorial('/home')}>홈으로</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
