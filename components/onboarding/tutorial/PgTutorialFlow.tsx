'use client';

// pg 튜토리얼(/tutorial) 본체 — buyer의 BuyerTutorialFlow와 같은 골격(phase 상태머신,
// 상단 진행 라인, CoachmarkTour 마운트, updateOnboardingAction 스탬프)으로 "초대 수신 →
// 요청 조건 확인 → 견적 작성·제출 → 완료" 여정을 가상 체험시킨다(라우트 이동 없음).
// 실제 요청 조건 패널(RfpBriefPanel)·견적 위저드(BidWizard)를 fixture 데이터로 그대로
// 구동하고, 종결 지점(onSampleSubmit)만 실제 서버 액션을 우회한다.
//
// draft 격리 불필요: BidWizard의 useBidDraft는 rfpId별 localStorage 키('bid-draft:<rfpId>')를
// 쓰는데, tutorialBuyerRfp.id가 실제 RFP uuid와 절대 겹치지 않는 고정 문자열('tutorial-rfp')
// 이라 실제 작성 중이던 draft를 밟을 위험이 없다(buyer의 useIsolatedRfpDraft가 필요했던
// 이유 — 전역 zustand 스토어 하나를 공유하는 RfpCreateWizard와 다른 상황).
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/primitives/Button';
import { Divider } from '@/components/primitives/Divider';
import { CoachmarkTour } from '@/components/onboarding/coachmarks';
import { RfpBriefPanel } from '@/components/inbox/RfpBriefPanel';
import { BidWizard } from '@/components/inbox/bid-wizard/BidWizard';
import { InviteScene } from './InviteScene';
import { pgBriefTour, pgWriteTour, pgSubmitTour } from './tours';
import { useCelebrationConfetti } from '@/lib/hooks/useCelebrationConfetti';
import { updateOnboardingAction } from '@/lib/server/actions/onboarding/updateOnboardingAction';
import { tutorialBuyerRfp, tutorialBuyerName } from '@/lib/onboarding/tutorial-fixtures';

type Phase = 'invite' | 'brief' | 'write' | 'done';

const PHASE_ORDER: Phase[] = ['invite', 'brief', 'write', 'done'];
const PHASE_LABELS: Record<Phase, string> = {
  invite: '초대 확인',
  brief: '요청 조건 확인',
  write: '견적 작성',
  done: '완료',
};

export function PgTutorialFlow() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('invite');
  const [briefTourDone, setBriefTourDone] = useState(false);
  const [writeTourDone, setWriteTourDone] = useState(false);
  const [submitTourDone, setSubmitTourDone] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const { canvasRef, fire } = useCelebrationConfetti();

  const stepNum = PHASE_ORDER.indexOf(phase) + 1;

  const handleExit = () => {
    void updateOnboardingAction({ key: 'pgTutorial', event: 'dismissed' });
    router.push('/home');
  };

  const handleSampleSubmit = () => {
    fire();
    void updateOnboardingAction({ key: 'pgTutorial', event: 'completed' });
    setPhase('done');
  };

  return (
    <div className="flex flex-1 flex-col">
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-50 h-full w-full"
      />
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
        {phase === 'invite' && (
          <InviteScene
            buyerName={tutorialBuyerName}
            rfpTitle={tutorialBuyerRfp.title}
            deadline={tutorialBuyerRfp.deadline}
            onProceed={() => setPhase('brief')}
          />
        )}

        {phase === 'brief' && (
          <>
            <div className="px-6 py-6">
              <RfpBriefPanel rfp={tutorialBuyerRfp} buyerName={tutorialBuyerName} />
              <div className="mt-6">
                <Button onClick={() => setPhase('write')}>견적 작성하기</Button>
              </div>
            </div>
            {!briefTourDone && (
              <CoachmarkTour steps={pgBriefTour} onFinish={() => setBriefTourDone(true)} onSkip={() => setBriefTourDone(true)} />
            )}
          </>
        )}

        {phase === 'write' && (
          <>
            <BidWizard
              rfp={tutorialBuyerRfp}
              buyerName={tutorialBuyerName}
              onStepChange={setWizardStep}
              onSampleSubmit={handleSampleSubmit}
            />
            {!writeTourDone && (
              <CoachmarkTour steps={pgWriteTour} onFinish={() => setWriteTourDone(true)} onSkip={() => setWriteTourDone(true)} />
            )}
            {/* 제출 팁은 제출 버튼이 실제로 존재하는 4단계(검토·발송) 도달 시점에 표시한다. */}
            {writeTourDone && !submitTourDone && wizardStep === 4 && (
              <CoachmarkTour steps={pgSubmitTour} onFinish={() => setSubmitTourDone(true)} onSkip={() => setSubmitTourDone(true)} />
            )}
          </>
        )}

        {phase === 'done' && (
          <div className="flex flex-col items-center gap-4 px-8 py-16 text-center">
            <h2 className="text-[20px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
              튜토리얼을 완료했어요
            </h2>
            <p className="text-[14px] text-[var(--md-sys-color-on-surface-variant)]">
              견적은 봉인돼요 — 다른 PG사의 견적이나 참여 수는 서로 공개되지 않아요.
            </p>
            <div className="flex flex-col gap-2">
              <Button onClick={() => router.push('/inbox')}>받은 견적 요청 보기</Button>
              <Button variant="outlined" onClick={() => router.push('/home')}>홈으로</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
