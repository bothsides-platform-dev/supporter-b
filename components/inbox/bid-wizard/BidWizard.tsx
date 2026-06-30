'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { HTTPError } from 'ky';
import { http } from '@/lib/http';
import { Divider } from '@/components/ui/Divider';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Label } from '@/components/primitives/Label';
import { Select } from '@/components/primitives/Select';
import { toast } from '@/lib/toast';
import { useBidDraft, EMPTY_BID_DRAFT, isPristineDraft, type BidDraft } from '../useBidDraft';
import { submitBidAction } from '@/lib/server/actions/bid';
import { simulateSampleAwardAction } from '@/lib/server/actions/onboarding/simulateSampleAwardAction';
import { saveQuoteTemplateAction } from '@/lib/server/actions/quote-template/saveQuoteTemplateAction';
import { SamplePgAwardCelebration } from '../SamplePgAwardCelebration';
import { SAMPLE_AWARD_DELAY_MS } from './sample-award';
import {
  MERCHANT_TIERS,
  PAYMENT_METHOD_CATEGORIES,
  isTieredMethod,
  isFlatFeeMethod,
  type PaymentMethod,
  type QuoteTemplateOption,
} from '@/lib/types/bid';
import { buildPaymentFees, parseSettleCycle, pctToDecimal, templateFeesToFlat } from '@/lib/quote/template-fees';
import type { PgRfpDetailData } from '@/lib/server/rfp-detail-loader';

import { WizardStepSidebar } from '@/components/rfp/WizardStepSidebar';
import { WizardProgressBar } from '@/components/rfp/WizardProgressBar';
import { BID_WIZARD_STEPS } from './bid-wizard-steps';
import { getBidWizardValidity, getFirstIncompleteBidStep } from './bid-wizard-validation';
import { BidContextStrip } from './BidContextStrip';
import { type ProposalState } from './BidStepProposal';
import { BidWizardProvider, type BidWizardContextValue } from './bid-wizard-context';
import { BidStepSettlementContainer } from './BidStepSettlementContainer';
import { BidStepFeesContainer } from './BidStepFeesContainer';
import { BidStepProposalContainer } from './BidStepProposalContainer';
import { BidStepReviewContainer } from './BidStepReviewContainer';

const ALL_PAYMENT_METHODS: PaymentMethod[] = PAYMENT_METHOD_CATEGORIES.flatMap((c) => c.methods);
const TOTAL_STEPS = BID_WIZARD_STEPS.length;

type Props = {
  rfp: PgRfpDetailData['rfp'];
  buyerName: string;
  templates?: QuoteTemplateOption[];
  /** 재요청 시 직전 라운드 견적을 prefill 기준값으로 시드. */
  initialBid?: PgRfpDetailData['myBid'];
  /**
   * 랜딩 데모 전용(opt-in). 주어지면 제출 시 서버 액션 대신 이 콜백을 호출한다
   * — 비로그인 임베디드 데모에서 실제 submitBidAction 을 치지 않도록(가입 유도). 프로덕션 미전달 시 no-op.
   */
  onGuestSubmit?: () => void;
};

/**
 * Bid 도메인 객체 → BidDraft 폼 상태로 변환 (재요청 prefill용).
 *
 * NOTE: TierRates(객체형) 요율은 단순화로 생략 — 단일 number 요율만 prefill.
 * 구간별 요율 편집은 사용자가 직접 수행.
 */
export function bidToDraft(b: NonNullable<PgRfpDetailData['myBid']>): BidDraft {
  const m = /^([A-Z]+)\+?(\d+)?$/.exec(b.settleCycle);
  const fees: Record<string, string> = {};
  // decimal → percent 문자열, 2dp 반올림 (폼 표시와 상태 일치).
  const fmtPct2dp = (rate: number): string => String(Math.round(rate * 1e4) / 100);
  for (const [k, v] of Object.entries(b.paymentFees ?? {})) {
    if (typeof v === 'number') {
      // 정액(건당) 수단은 '원' 정수 그대로, 정률 수단은 decimal → percent 문자열.
      fees[k] = isFlatFeeMethod(k as PaymentMethod) ? String(v) : fmtPct2dp(v);
    }
    // TierRates(object) — 단순화로 생략; 사용자가 직접 입력
  }
  for (const [k, v] of Object.entries(b.customFees ?? {})) {
    fees[k] = fmtPct2dp(v);
  }
  const rawNum = parseInt(m?.[2] ?? '1');
  return {
    __v: 3,
    cycleUnit: (m?.[1] ?? 'D') as BidDraft['cycleUnit'],
    cycleNum: String(Math.min(rawNum, 99)),
    settleLimit: String(b.settleLimit ?? 0),
    guaranteeInsurance: String(b.guaranteeInsurance ?? 0),
    fees,
    memo: b.memo ?? '',
  };
}

export function BidWizard({ rfp, buyerName, templates = [], initialBid, onGuestSubmit }: Props) {
  const router = useRouter();
  const rfpId = rfp.id;
  const rfpCode = rfp.code;
  const requiredPaymentMethods = rfp.requiredPaymentMethods;
  const customPaymentMethods = rfp.customPaymentMethods;

  const [pending, startTransition] = useTransition();
  const [currentStep, setCurrentStep] = useState(1);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  // 온보딩 샘플 전용 흐름: 제출 → '검토중' 안내 → 잠시 뒤 선정 시뮬레이트 → 축하.
  const [samplePhase, setSamplePhase] = useState<'idle' | 'reviewing' | 'awarded'>('idle');

  // baseline = 위저드가 처음 열렸을 때의 폼(일반=빈 폼, 재요청=직전 라운드 prefill).
  const baseline = useMemo<BidDraft>(
    () => (initialBid ? bidToDraft(initialBid) : EMPTY_BID_DRAFT),
    [initialBid],
  );
  // 초안 자동저장/복원
  const { draft, saveDraft, clearDraft, savedAt } = useBidDraft(rfpId);
  // 의미 있는 초안이면 묻지 않고 초기값으로 복원.
  const restoredFromDraft = draft !== null && !isPristineDraft(draft, baseline);
  const [fields, setFields] = useState<BidDraft>(() => (restoredFromDraft ? draft! : baseline));
  const setField = useCallback(
    <K extends keyof BidDraft>(key: K, value: BidDraft[K]) =>
      setFields((f) => ({ ...f, [key]: value })),
    [],
  );
  const setFee = useCallback(
    (key: string, value: string) =>
      setFields((f) => ({ ...f, fees: { ...f.fees, [key]: value } })),
    [],
  );
  const { cycleUnit, cycleNum, settleLimit, guaranteeInsurance, fees, memo } = fields;

  useEffect(() => {
    saveDraft(fields);
  }, [fields]); // eslint-disable-line react-hooks/exhaustive-deps

  // 마운트 1회: 의미 있는 초안을 복원했으면 토스트로만 알린다(묻지 않음).
  useEffect(() => {
    if (restoredFromDraft) {
      toast('이전에 작성하던 내용을 그대로 불러왔어요', { id: `bid-draft-restored:${rfpId}` });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 견적서 업로드
  const [proposal, setProposal] = useState<ProposalState>(null);
  const uploadProposal = useCallback(
    async (file: File): Promise<void> => {
      if (file.type !== 'application/pdf') {
        setProposal({ name: file.name, status: 'error', error: 'PDF만 업로드 가능합니다.' });
        return;
      }
      setProposal({ name: file.name, status: 'uploading' });
      const form = new FormData();
      form.append('file', file);
      form.append('ownerKind', 'bid_proposal');
      form.append('ownerId', rfpId);
      try {
        const body = await http.post('/api/files/upload', { body: form }).json<{ id: string; name: string; size: number }>();
        setProposal(body);
      } catch (err) {
        let error = err instanceof Error ? err.message : '네트워크 오류';
        if (err instanceof HTTPError) {
          const { status } = err.response;
          error = status === 413 ? '파일이 너무 큽니다 (최대 20MB)' : status === 415 ? '지원되지 않는 파일 형식입니다' : `업로드 실패 (${status})`;
        }
        setProposal({ name: file.name, status: 'error', error });
      }
    },
    [rfpId],
  );
  const clearProposal = useCallback(() => setProposal(null), []);
  // 처음부터 다시: 초안 삭제 + baseline 으로 폼 리셋 + 견적서 선택 해제 + 1단계로.
  const handleReset = () => {
    clearDraft();
    setFields(baseline);
    setProposal(null);
    setCurrentStep(1);
    setResetConfirmOpen(false);
  };
  const proposalReady = proposal && 'id' in proposal;
  const proposalUploading = proposal && 'status' in proposal && proposal.status === 'uploading';

  // 파생값
  const feeInputMethods = requiredPaymentMethods.length > 0 ? requiredPaymentMethods : ALL_PAYMENT_METHODS;
  const settleCycle = `${cycleUnit}+${cycleNum || '1'}`;
  const feeFilled = (key: string) => (fees[key] ?? '') !== '' && parseFloat(fees[key]) >= 0;
  const anyTieredFilled = feeInputMethods.some(
    (m) => isTieredMethod(m) && MERCHANT_TIERS.some((t) => feeFilled(`${m}:${t}`)),
  );
  const anySingleFilled =
    feeInputMethods.some((m) => !isTieredMethod(m) && feeFilled(m)) ||
    customPaymentMethods.some((c) => feeFilled(c.id));
  const anyFeeFilled = anyTieredFilled || anySingleFilled;
  const canSubmit = !pending && !proposalUploading && cycleNum !== '' && parseInt(cycleNum) > 0 && anyFeeFilled;

  const applyTemplate = (t: QuoteTemplateOption) => {
    clearDraft();
    const { unit, num } = parseSettleCycle(t.settleCycle);
    // 입찰 폼은 구버전 단일요율 템플릿을 전 구간으로 전개해 보여준다.
    const decoded = templateFeesToFlat(t.paymentFees, feeInputMethods, {
      spreadLegacyTieredSingleRate: true,
    });
    setFields((f) => ({
      ...f,
      cycleUnit: unit,
      cycleNum: num,
      settleLimit: String(t.settleLimit),
      guaranteeInsurance: String(t.guaranteeInsurance),
      fees: { ...f.fees, ...decoded },
    }));
    toast(`‘${t.name}’ 템플릿을 불러왔어요`);
  };

  // 단계 이동 — 자유 점프(구매사 위저드 미러)
  const completed = getBidWizardValidity({ cycleNum, anyFeeFilled }).map((s) => s.complete);
  const advance = useCallback(() => setCurrentStep((s) => Math.min(TOTAL_STEPS, s + 1)), []);
  const back = useCallback(() => setCurrentStep((s) => Math.max(1, s - 1)), []);
  const goToStep = useCallback(
    (step: number) => setCurrentStep(Math.min(TOTAL_STEPS, Math.max(1, step))),
    [],
  );

  const onSaveTemplate = useCallback(
    async (name: string) => {
      const r = await saveQuoteTemplateAction({
        name,
        settleCycle,
        settleLimit: parseInt(settleLimit) || 0,
        guaranteeInsurance: parseInt(guaranteeInsurance) || 0,
        paymentFees: buildPaymentFees(fees, feeInputMethods),
      });
      return r.ok ? { ok: true as const } : { ok: false as const, error: r.error };
    },
    [settleCycle, settleLimit, guaranteeInsurance, fees, feeInputMethods],
  );

  const handleSubmit = useCallback(() => {
    // 발송 버튼은 막지 않되, 미충족 단계가 있으면 그 단계로 이동.
    const incomplete = getFirstIncompleteBidStep({ cycleNum, anyFeeFilled });
    if (incomplete) {
      setCurrentStep(incomplete.num);
      return;
    }
    setSubmitError(null);
    setSubmitConfirmOpen(true);
  }, [cycleNum, anyFeeFilled]);

  // 4단계가 공유하는 컨텍스트 값 — prop-drilling 제거. 안정 참조(useCallback)
  // 액션 + 폼 상태를 묶어 useMemo 로 캐싱해, 무관한 단계의 리렌더를 줄인다.
  const wizardContext: BidWizardContextValue = useMemo(
    () => ({
      cycleUnit,
      cycleNum,
      settleLimit,
      guaranteeInsurance,
      fees,
      memo,
      settleCycle,
      feeInputMethods,
      customPaymentMethods,
      proposal,
      pending,
      submitError,
      canSubmit,
      setField,
      setFee,
      uploadProposal: (f) => void uploadProposal(f),
      clearProposal,
      advance,
      back,
      handleSubmit,
      onSaveTemplate,
    }),
    [
      cycleUnit,
      cycleNum,
      settleLimit,
      guaranteeInsurance,
      fees,
      memo,
      settleCycle,
      feeInputMethods,
      customPaymentMethods,
      proposal,
      pending,
      submitError,
      canSubmit,
      setField,
      setFee,
      uploadProposal,
      clearProposal,
      advance,
      back,
      handleSubmit,
      onSaveTemplate,
    ],
  );

  const doSubmit = () => {
    setSubmitConfirmOpen(false);
    // 랜딩 데모(게스트): 실제 제출 대신 가입 유도 콜백만 호출하고 종료.
    if (onGuestSubmit) {
      onGuestSubmit();
      return;
    }
    const paymentFees = buildPaymentFees(fees, feeInputMethods);
    const customFees: Record<string, number> = {};
    for (const c of customPaymentMethods) {
      const v = fees[c.id] ?? '';
      if (v !== '') customFees[c.id] = pctToDecimal(v);
    }
    startTransition(async () => {
      const r = await submitBidAction({
        rfpId,
        settleCycle,
        settleLimit: parseInt(settleLimit) || 0,
        guaranteeInsurance: parseInt(guaranteeInsurance) || 0,
        paymentFees,
        customFees,
        proposalAttachmentId: proposalReady ? proposal.id : undefined,
        memo: memo.trim() || undefined,
      });
      if (r.ok) {
        clearDraft();
        if (rfp.isSample) {
          // 샘플은 제출 후 리다이렉트하지 않고 '검토중 → 선정' 시뮬레이션으로 이어간다.
          setSamplePhase('reviewing');
        } else {
          // 별도 /submitted 페이지로 이탈하지 않고 같은 창에서 갱신 — submitBidAction 이
          // revalidatePath('/inbox/<code>') 했으므로 refresh 면 로더 재실행 → myBid 존재 →
          // PgDealRoomBody 가 제출 완료 상태를 인플레이스 렌더. (push+refresh 동시 금지:
          // Next 16 useTransition 행, vercel/next.js#86055.)
          router.refresh();
        }
      } else {
        setSubmitError(r.error);
        setCurrentStep(4);
      }
    });
  };

  // 샘플 '검토중' 진입 후 잠시 뒤 선정을 시뮬레이트하고 축하 화면으로 전환한다.
  useEffect(() => {
    if (samplePhase !== 'reviewing') return;
    const t = setTimeout(async () => {
      await simulateSampleAwardAction({ code: rfpCode });
      setSamplePhase('awarded');
      router.refresh(); // 인박스가 '선정됨'을 반영하도록
    }, SAMPLE_AWARD_DELAY_MS);
    return () => clearTimeout(t);
  }, [samplePhase, rfpCode, router]);

  if (samplePhase === 'awarded') {
    return <SamplePgAwardCelebration buyerName={buyerName} />;
  }

  return (
    <>
      {samplePhase === 'reviewing' && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-2 bg-[var(--md-sys-color-surface)] px-6 text-center">
          <p className="text-title-medium">구매사가 검토하고 있어요</p>
          <p className="text-body-medium text-on-surface-variant">잠시만 기다려 주세요…</p>
        </div>
      )}
      <ConfirmDialog
        open={submitConfirmOpen}
        onOpenChange={(o) => !o && setSubmitConfirmOpen(false)}
        title="견적을 보낼까요?"
        description="보낸 후에는 수정할 수 없어요."
        confirmLabel="견적 보내기"
        variant="default"
        onConfirm={doSubmit}
        loading={pending}
      />
      <ConfirmDialog
        open={resetConfirmOpen}
        onOpenChange={(o) => !o && setResetConfirmOpen(false)}
        title="작성 중인 내용을 지울까요?"
        description="지금까지 입력한 정산조건·수수료·견적서가 모두 사라져요."
        confirmLabel="처음부터 다시"
        variant="danger"
        onConfirm={handleReset}
      />

      <BidWizardProvider value={wizardContext}>
      <div className="border border-[var(--md-sys-color-outline-variant)] rounded-[8px] overflow-hidden">
        <BidContextStrip buyerName={buyerName} rfp={rfp} currentStep={currentStep} feeInputMethods={feeInputMethods} />

        <div className="flex min-h-0">
          <WizardStepSidebar
            currentStep={currentStep}
            completed={completed}
            onStepClick={goToStep}
            steps={BID_WIZARD_STEPS}
            title="견적 작성"
            footer={
              !isPristineDraft(fields, baseline) || savedAt ? (
                <div className="flex flex-col gap-1.5">
                  {!isPristineDraft(fields, baseline) && (
                    <button
                      type="button"
                      onClick={() => setResetConfirmOpen(true)}
                      className="self-start font-mono text-[10px] text-[var(--md-sys-color-outline)] underline underline-offset-2 hover:text-[var(--md-sys-color-on-surface-variant)]"
                    >
                      초기화
                    </button>
                  )}
                  {savedAt ? (
                    <span className="font-mono text-[10px] text-[var(--md-sys-color-outline)]">
                      💾 자동저장됨 · {savedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </span>
                  ) : null}
                </div>
              ) : null
            }
          />

          <div className="flex-1 min-w-0 flex flex-col">
            <WizardProgressBar currentStep={currentStep} completed={completed} onStepClick={goToStep} steps={BID_WIZARD_STEPS} />

            <div className="px-6 py-6">
              <div className="flex items-center gap-3 mb-6">
                <span className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
                  {String(currentStep).padStart(2, '0')} — {BID_WIZARD_STEPS[currentStep - 1].label}
                </span>
                <Divider />
              </div>

              {currentStep === 1 && (
                <div className="space-y-8">
                  <div className="space-y-1">
                    <Label size="md" muted={false}>견적 템플릿 불러오기</Label>
                    {templates.length > 0 ? (
                      <Select
                        options={[{ value: '', label: '템플릿 선택…' }, ...templates.map((t) => ({ value: t.id, label: t.name }))]}
                        value=""
                        onChange={(id) => {
                          const t = templates.find((x) => x.id === id);
                          if (t) applyTemplate(t);
                        }}
                      />
                    ) : (
                      <div className="rounded-[6px] border border-[var(--md-sys-color-outline-variant)] px-3 py-2.5 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
                        저장된 견적 템플릿이 없어요. 자주 쓰는 정산조건·수수료를 템플릿으로 저장하면 다음부터 한 번에 불러올 수 있어요.{' '}
                        <Link
                          href="/quote-templates"
                          className="text-[var(--md-sys-color-primary)] underline underline-offset-2"
                        >
                          템플릿 관리
                        </Link>
                      </div>
                    )}
                  </div>
                  <BidStepSettlementContainer />
                </div>
              )}

              {currentStep === 2 && <BidStepFeesContainer />}

              {currentStep === 3 && <BidStepProposalContainer />}

              {currentStep === 4 && <BidStepReviewContainer />}
            </div>
          </div>
        </div>
      </div>
      </BidWizardProvider>
    </>
  );
}
