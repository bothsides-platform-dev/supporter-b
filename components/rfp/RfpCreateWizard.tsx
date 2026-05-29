// components/rfp/RfpCreateWizard.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { WizardStepSidebar } from './WizardStepSidebar';
import { WizardProgressBar } from './WizardProgressBar';
import { RfpStep1BizProfile } from './RfpStep1BizProfile';
import { RfpStep2Content } from './RfpStep2Content';
import { RfpStep3PgSelect } from './RfpStep3PgSelect';
import { RfpStep4Review } from './RfpStep4Review';

import { createRfpAction } from '@/lib/server/actions/rfp';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';
import { toast } from '@/lib/toast';
import type { BizProfile } from '@/lib/types/biz-profile';
import { STEP_LABELS } from './wizard-steps';
import { getWizardValidity, getFirstIncompleteStep } from './wizard-validation';

const TOTAL_STEPS = STEP_LABELS.length;

const SOLUTION_VALUES = ['cafe24', 'imweb', 'makeshop', 'godo', 'self', 'other'] as const;
type SolutionValue = (typeof SOLUTION_VALUES)[number];

type Props = {
  bizProfile?: Pick<BizProfile, 'bizNo' | 'taxType' | 'status'>;
  workspaceName?: string;
  guest?: boolean;
};

export function RfpCreateWizard({ bizProfile, workspaceName, guest }: Props) {
  const router = useRouter();
  const draft = useRfpDraftStore();

  const [currentStep, setCurrentStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  // 각 step의 완료 여부를 실제 입력값으로 독립 판정 — 순서와 무관.
  const completed = getWizardValidity(draft).map((s) => s.complete);

  // 자유 이동 — 어느 step이든(앞/뒤 무관) 바로 이동. 순서 강제 없음.
  const advance = () => setCurrentStep((s) => Math.min(TOTAL_STEPS, s + 1));
  const back = () => setCurrentStep((s) => Math.max(1, s - 1));
  const goToStep = (step: number) =>
    setCurrentStep(Math.min(TOTAL_STEPS, Math.max(1, step)));

  const handleSubmit = async () => {
    if (submitting) return;

    if (guest) {
      localStorage.setItem('supporter-b-rfp-next', '/rfp/new');
      router.push('/signup/buyer');
      return;
    }

    // 발송 버튼은 막지 않는다. 누른 시점에 미충족 step이 있으면 토스트로
    // 안내하고 그 step으로 이동(서버 검증은 안전망으로 그대로 유지).
    const incomplete = getFirstIncompleteStep(draft);
    if (incomplete) {
      toast(incomplete.hint, { type: 'error' });
      setCurrentStep(incomplete.num);
      return;
    }

    setSubmitting(true);
    setServerError('');

    const solutionRaw = draft.currentSolution;
    const currentSolution: SolutionValue | undefined =
      (SOLUTION_VALUES as readonly string[]).includes(solutionRaw) && solutionRaw !== ''
        ? (solutionRaw as SolutionValue)
        : undefined;

    let result: Awaited<ReturnType<typeof createRfpAction>>;
    try {
      result = await createRfpAction({
        title: draft.title.trim(),
        websiteUrl: draft.websiteUrl.trim() || undefined,
        mainProducts: draft.mainProducts.trim() || undefined,
        annualPgVolume: draft.annualPgVolume.trim() || undefined,
        currentFeeRate: draft.currentFeeRate.trim() || undefined,
        currentSettlementLimit: draft.currentSettlementLimit.trim() || undefined,
        currentGuaranteeInsurance: draft.currentGuaranteeInsurance.trim() || undefined,
        currentSolution,
        currentSolutionDetail: draft.currentSolutionDetail.trim() || undefined,
        memo: draft.memo.trim() || undefined,
        deadline: draft.deadline,
        allowedPgWorkspaceIds: draft.allowedPgWorkspaceIds.map((w) => w.id),
        rfpAttachmentIds: draft.rfpFiles.map((f) => f.id),
        requiredPaymentMethods: draft.requiredPaymentMethods,
        customPaymentMethods: draft.customPaymentMethods,
        send: true,
      });
    } catch {
      setSubmitting(false);
      setServerError('NETWORK_ERROR');
      return;
    }

    setSubmitting(false);

    if (!result.ok) {
      setServerError(result.error);
      return;
    }

    const pgCount = draft.allowedPgWorkspaceIds.length;
    toast(`${pgCount}개 PG사에 제안서가 발송되었습니다`, { type: 'success' });
    draft.reset();
    router.push(`/rfp/${result.rfpId}`);
  };

  return (
    <div className="flex h-full min-h-0">
      {/* Desktop: left step sidebar (hidden on mobile via WizardStepSidebar internal class) */}
      <WizardStepSidebar
        currentStep={currentStep}
        completed={completed}
        onStepClick={goToStep}
      />

      {/* Content area */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Mobile: top progress bar (hidden on desktop via WizardProgressBar internal class) */}
        <WizardProgressBar
          currentStep={currentStep}
          completed={completed}
          onStepClick={goToStep}
        />

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {/* Step header */}
          <div className="flex items-center gap-3 mb-6">
            <span className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
              {String(currentStep).padStart(2, '0')} — {STEP_LABELS[currentStep - 1]}
            </span>
            <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
          </div>

          {currentStep === 1 && (
            <RfpStep1BizProfile
              bizProfile={bizProfile}
              workspaceName={workspaceName}
              guest={guest}
              onNext={advance}
            />
          )}
          {currentStep === 2 && <RfpStep2Content onBack={back} onNext={advance} />}
          {currentStep === 3 && <RfpStep3PgSelect onBack={back} onNext={advance} />}
          {currentStep === 4 && (
            <RfpStep4Review
              bizProfile={bizProfile}
              workspaceName={workspaceName}
              onBack={back}
              onSubmit={handleSubmit}
              submitting={submitting}
              serverError={serverError}
            />
          )}
        </div>
      </div>
    </div>
  );
}
