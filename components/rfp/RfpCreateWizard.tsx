// components/rfp/RfpCreateWizard.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { WizardStepSidebar } from './WizardStepSidebar';
import { WizardProgressBar } from './WizardProgressBar';
import { RfpStep1BizProfile } from './RfpStep1BizProfile';
import { RfpStep2Content } from './RfpStep2Content';
import { RfpStep3PgSelect } from './RfpStep3PgSelect';
import { RfpStep4Review } from './RfpStep4Review';

import { createRfpAction, verifyDraftFilesAction } from '@/lib/server/actions/rfp';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';
import { toast } from '@/lib/toast';
import type { BizProfile } from '@/lib/types/biz-profile';
import type { PgWorkspace } from './RfpStep3PgSelect';
import { STEP_LABELS } from './wizard-steps';
import { getWizardValidity, getFirstIncompleteStep } from './wizard-validation';

const TOTAL_STEPS = STEP_LABELS.length;

const SOLUTION_VALUES = ['cafe24', 'imweb', 'makeshop', 'godo', 'self', 'other'] as const;
type SolutionValue = (typeof SOLUTION_VALUES)[number];

type Props = {
  bizProfile?: Pick<BizProfile, 'bizNo' | 'taxType' | 'status'>;
  workspaceName?: string;
  guest?: boolean;
  pgList: PgWorkspace[];
};

export function RfpCreateWizard({ bizProfile, workspaceName, guest, pgList }: Props) {
  const router = useRouter();
  const draft = useRfpDraftStore();

  const [currentStep, setCurrentStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // 마운트 시 localStorage draft의 stale 데이터 정리.
  useEffect(() => {
    const { allowedPgWorkspaceIds, deadline, rfpFiles, setField } =
      useRfpDraftStore.getState();

    // 1. PG 워크스페이스 재조정 — 현재 pgList에 없는 ID 제거
    const validPgIds = new Set(pgList.map((w) => w.id));
    const stalePgs = allowedPgWorkspaceIds.filter((w) => !validPgIds.has(w.id));
    if (stalePgs.length > 0) {
      setField('allowedPgWorkspaceIds', allowedPgWorkspaceIds.filter((w) => validPgIds.has(w.id)));
      toast(`${stalePgs.length}개 PG사가 현재 선택 불가 상태여서 제외됐어요`, { type: 'info' });
    }

    // 2. 마감일 만료 확인 — 과거 날짜이면 초기화
    if (deadline && new Date(deadline) < new Date()) {
      setField('deadline', '');
      toast('저장된 마감일이 지나 초기화했어요', { type: 'info' });
    }

    // 3. 첨부파일 유효성 확인 — DB에 없는(sweep된) 파일 제거
    const fileIds = rfpFiles.map((f) => f.id);
    if (fileIds.length > 0) {
      verifyDraftFilesAction(fileIds).then((result) => {
        const validIdSet = new Set(result.validIds);
        const staleFiles = rfpFiles.filter((f) => !validIdSet.has(f.id));
        if (staleFiles.length > 0) {
          setField('rfpFiles', rfpFiles.filter((f) => validIdSet.has(f.id)));
          toast(`${staleFiles.length}개 첨부 파일이 만료되어 제외됐어요`, { type: 'info' });
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [serverError, setServerError] = useState('');
  const [websiteRejected, setWebsiteRejected] = useState('');
  // advance/goToStep 실패를 경험한 step set — back 후 복귀해도 에러 표시 유지
  const [failedSteps, setFailedSteps] = useState<Set<number>>(new Set());

  // 각 step의 완료 여부를 실제 입력값으로 독립 판정 — 순서와 무관.
  const validity = getWizardValidity(draft);
  const completed = validity.map((s) => s.complete);
  // 사이드바·프로그레스바에 ✗ 표시 범위를 전달 — 실패 이력이 있는 step만 오류 표시.
  const failedAt = validity.map((s) => failedSteps.has(s.num));

  // step N에 이동하려면 steps 1..N-1이 모두 complete이어야 한다.
  const canNavigateTo = (step: number) =>
    validity.slice(0, step - 1).every((s) => s.complete);

  const markFailed = (stepNum: number) =>
    setFailedSteps((prev) => { const next = new Set(prev); next.add(stepNum); return next; });

  // advance: 현재 step이 미완료면 hint toast 후 차단. 실패 시 해당 step을 failedSteps에 기록.
  const advance = () => {
    const cur = validity[currentStep - 1];
    if (!cur?.complete) {
      toast(cur?.hint ?? '현재 단계를 완료해주세요.', { type: 'error' });
      markFailed(currentStep);
      return;
    }
    setCurrentStep((s) => Math.min(TOTAL_STEPS, s + 1));
  };

  const back = () => setCurrentStep((s) => Math.max(1, s - 1));

  // goToStep: 이전 step이 모두 complete일 때만 이동. blocker step을 failedSteps에 기록.
  const goToStep = (step: number) => {
    const clamped = Math.min(TOTAL_STEPS, Math.max(1, step));
    if (!canNavigateTo(clamped)) {
      const blocker = validity.find((s) => s.num < clamped && !s.complete);
      if (blocker) {
        toast(blocker.hint, { type: 'error' });
        markFailed(blocker.num);
      }
      return;
    }
    setCurrentStep(clamped);
  };

  const handleSubmit = async () => {
    if (submitting) return;

    if (guest) {
      localStorage.setItem('supporter-b-rfp-next', '/rfp-create');
      router.push('/signup/buyer');
      return;
    }

    // 발송 버튼은 막지 않는다. 누른 시점에 미충족 step이 있으면 토스트로
    // 안내하고 그 step으로 이동(서버 검증은 안전망으로 그대로 유지).
    const incomplete = getFirstIncompleteStep(draft);
    if (incomplete) {
      toast(incomplete.hint, { type: 'error' });
      markFailed(incomplete.num);
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
        currentSettlementCycle: draft.currentSettlementCycle.trim() || undefined,
        deliveryServicePeriod: draft.deliveryServicePeriod.trim() || undefined,
        currentSolution,
        currentSolutionDetail: draft.currentSolutionDetail.trim() || undefined,
        memo: draft.memo.trim() || undefined,
        deadline: draft.deadline,
        allowedPgWorkspaceIds: draft.allowedPgWorkspaceIds.map((w) => w.id),
        rfpAttachmentIds: draft.rfpFiles.map((f) => f.id),
        requiredPaymentMethods: draft.requiredPaymentMethods,
        customPaymentMethods: draft.customPaymentMethods,
        boardVisible: draft.boardVisible,
        currentFeeVisibleToPg: draft.currentFeeVisibleToPg,
        contractType: draft.contractType ?? undefined,
        send: true,
      });
    } catch {
      setSubmitting(false);
      setServerError('NETWORK_ERROR');
      return;
    }

    setSubmitting(false);

    if (!result.ok) {
      if (result.error === 'INVALID_WEBSITE') {
        setWebsiteRejected(draft.websiteUrl.trim());
        markFailed(2);
        setCurrentStep(2);
        return;
      }
      setServerError(result.error);
      return;
    }

    const pgCount = draft.allowedPgWorkspaceIds.length;
    toast(`${pgCount}개 PG사에 견적 요청을 보냈어요`, { type: 'success' });
    draft.reset();
    router.push(`/rfp/${result.rfpId}`);
  };

  return (
    // 스크롤 컨테이너를 루트로 통일 → 좌측 단계 네비/우측 콘텐츠 어디서 스크롤해도 동일 동작.
    // 사이드바는 sticky로 고정, 구분선은 우측 컬럼 border-l로 전체 높이 유지.
    <div className="flex h-full min-h-0 lg:overflow-y-auto">
      {/* Desktop: left step sidebar (hidden on mobile via WizardStepSidebar internal class) */}
      <WizardStepSidebar
        currentStep={currentStep}
        completed={completed}
        failedAt={failedAt}
        onStepClick={goToStep}
        className="sticky top-0 self-start border-r-0"
      />

      {/* Content area */}
      <div className="flex-1 flex flex-col min-w-0 lg:border-l border-[var(--md-sys-color-outline-variant)]">
        {/* Mobile: top progress bar (hidden on desktop via WizardProgressBar internal class) */}
        <WizardProgressBar
          currentStep={currentStep}
          completed={completed}
          failedAt={failedAt}
          onStepClick={goToStep}
        />

        <div className="flex-1 px-6 py-6">
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
          {currentStep === 2 && (
            <RfpStep2Content onBack={back} onNext={advance} showFieldErrors={failedSteps.has(2)} websiteRejected={websiteRejected} />
          )}
          {currentStep === 3 && (
            <RfpStep3PgSelect pgList={pgList} onBack={back} onNext={advance} showFieldErrors={failedSteps.has(3)} />
          )}
          {currentStep === 4 && (
            <RfpStep4Review
              bizProfile={bizProfile}
              workspaceName={workspaceName}
              onBack={back}
              onSubmit={handleSubmit}
              submitting={submitting}
              serverError={serverError}
              showFieldErrors={failedSteps.has(4)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
