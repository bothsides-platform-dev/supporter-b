'use client';

import { useEffect } from 'react';
import { RfpCreateWizard } from '@/components/rfp/RfpCreateWizard';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';
import { fixturePgs, fixtureBizProfile, demoWorkspaceName } from '@/components/landing/demo-fixtures';
import { demoFieldsForStage } from '@/components/landing/demo-stage-fill';
import { useIsolatedRfpDraft } from '@/components/landing/useIsolatedRfpDraft';
import { useDemoStepAutoplay } from '@/components/landing/useDemoStepAutoplay';
import { DemoCue } from '../DemoCue';

const TOTAL_WIZARD_STEPS = 4;
const WIZARD_AUTO_MS = 4000;

// 데모 작성 페이지 — 실제 RfpCreateWizard(guest·hideNav)를 격리된 draft로 구동한다.
// enabled일 때만 단계가 자동 진행되며, 진입 단계마다 데모 입력을 채운다. 종결 보내기는
// 명시적 클릭 시에만 가입으로 연결된다.
export function WizardPageHost({ enabled, showCue = false }: { enabled: boolean; showCue?: boolean }) {
  useIsolatedRfpDraft();
  const { step, setStep } = useDemoStepAutoplay(TOTAL_WIZARD_STEPS, WIZARD_AUTO_MS, enabled);

  useEffect(() => {
    useRfpDraftStore.setState(demoFieldsForStage(step));
  }, [step]);

  return (
    <div className="relative h-full">
      <DemoCue show={showCue} label="정보를 입력하고 견적을 요청해요" />
      <RfpCreateWizard
        guest
        bizProfile={fixtureBizProfile}
        workspaceName={demoWorkspaceName}
        pgList={fixturePgs}
        step={step}
        onStepChange={setStep}
        onGuestSubmit={() => window.location.assign('/signup/buyer')}
      />
    </div>
  );
}
