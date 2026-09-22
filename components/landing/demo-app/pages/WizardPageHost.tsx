'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RfpCreateWizard } from '@/components/rfp/RfpCreateWizard';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';
import { fixturePgs, fixtureBizProfile, demoWorkspaceName, fixtureIndustryGroups } from '@/components/landing/demo-fixtures';
import { demoFieldsForStage } from '@/components/landing/demo-stage-fill';
import { useIsolatedRfpDraft } from '@/components/landing/useIsolatedRfpDraft';
import { useDemoStepAutoplay } from '@/components/landing/useDemoStepAutoplay';
import { WIZARD_STEPS } from '@/components/rfp/wizard-steps';

const WIZARD_AUTO_MS = 4000;

// 데모 작성 페이지 — 실제 RfpCreateWizard(guest)를 격리된 draft로 구동한다.
// enabled일 때만 단계가 자동 진행되며, 진입 단계마다 데모 입력을 채운다. 종결 보내기는
// 명시적 클릭 시에만 가입으로 연결된다.
export function WizardPageHost({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  useIsolatedRfpDraft();
  const { step, setStep } = useDemoStepAutoplay(WIZARD_STEPS.length, WIZARD_AUTO_MS, enabled);

  useEffect(() => {
    useRfpDraftStore.setState(demoFieldsForStage(step));
  }, [step]);

  return (
    <div className="relative h-full">
      <RfpCreateWizard
        guest
        bizProfile={fixtureBizProfile}
        workspaceName={demoWorkspaceName}
        pgList={fixturePgs}
        industryGroups={fixtureIndustryGroups}
        step={step}
        onStepChange={setStep}
        onGuestSubmit={() => router.push('/signup/buyer')}
      />
    </div>
  );
}
