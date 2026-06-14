'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { HTTPError } from 'ky';
import { http } from '@/lib/http';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Label } from '@/components/primitives/Label';
import { Select } from '@/components/primitives/Select';
import { useBidDraft, type BidDraft } from '../useBidDraft';
import { submitBidAction } from '@/lib/server/actions/bid';
import { simulateSampleAwardAction } from '@/lib/server/actions/onboarding/simulateSampleAwardAction';
import { saveQuoteTemplateAction } from '@/lib/server/actions/quote-template/saveQuoteTemplateAction';
import { SamplePgAwardCelebration } from '../SamplePgAwardCelebration';
import { SAMPLE_AWARD_DELAY_MS } from './sample-award';
import {
  MERCHANT_TIERS,
  PAYMENT_METHOD_CATEGORIES,
  isTieredMethod,
  type PaymentMethod,
  type QuoteTemplateOption,
  type TierRates,
} from '@/lib/types/bid';
import type { PgRfpDetailData } from '@/lib/server/rfp-detail-loader';

import { WizardStepSidebar } from '@/components/rfp/WizardStepSidebar';
import { WizardProgressBar } from '@/components/rfp/WizardProgressBar';
import { BID_WIZARD_STEPS } from './bid-wizard-steps';
import { getBidWizardValidity, getFirstIncompleteBidStep } from './bid-wizard-validation';
import { BidContextStrip } from './BidContextStrip';
import { BidStepSettlement } from './BidStepSettlement';
import { BidStepFees } from './BidStepFees';
import { BidStepProposal, type ProposalState } from './BidStepProposal';
import { BidStepReview } from './BidStepReview';

const ALL_PAYMENT_METHODS: PaymentMethod[] = PAYMENT_METHOD_CATEGORIES.flatMap((c) => c.methods);
const TOTAL_STEPS = BID_WIZARD_STEPS.length;

type Props = {
  rfp: PgRfpDetailData['rfp'];
  buyerName: string;
  templates?: QuoteTemplateOption[];
  /** 재요청 시 직전 라운드 견적을 prefill 기준값으로 시드. */
  initialBid?: PgRfpDetailData['myBid'];
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
  for (const [k, v] of Object.entries(b.paymentFees ?? {})) {
    if (typeof v === 'number') {
      fees[k] = String(Math.round(v * 1e6) / 1e4);
    }
    // TierRates(object) — 단순화로 생략; 사용자가 직접 입력
  }
  for (const [k, v] of Object.entries(b.customFees ?? {})) {
    fees[k] = String(Math.round(v * 1e6) / 1e4);
  }
  return {
    __v: 3,
    cycleUnit: (m?.[1] ?? 'D') as BidDraft['cycleUnit'],
    cycleNum: m?.[2] ?? '1',
    settleLimit: String(b.settleLimit ?? 0),
    guaranteeInsurance: String(b.guaranteeInsurance ?? 0),
    fees,
    memo: b.memo ?? '',
  };
}

export function BidWizard({ rfp, buyerName, templates = [], initialBid }: Props) {
  const router = useRouter();
  const rfpId = rfp.id;
  const rfpCode = rfp.code;
  const requiredPaymentMethods = rfp.requiredPaymentMethods;
  const customPaymentMethods = rfp.customPaymentMethods;

  const [pending, startTransition] = useTransition();
  const [currentStep, setCurrentStep] = useState(1);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  // 온보딩 샘플 전용 흐름: 제출 → '검토중' 안내 → 잠시 뒤 선정 시뮬레이트 → 축하.
  const [samplePhase, setSamplePhase] = useState<'idle' | 'reviewing' | 'awarded'>('idle');

  const [fields, setFields] = useState<BidDraft>(() =>
    initialBid
      ? bidToDraft(initialBid)
      : { __v: 3, cycleUnit: 'D', cycleNum: '1', settleLimit: '0', guaranteeInsurance: '0', fees: {}, memo: '' },
  );
  const setField = <K extends keyof BidDraft>(key: K, value: BidDraft[K]) =>
    setFields((f) => ({ ...f, [key]: value }));
  const setFee = (key: string, value: string) =>
    setFields((f) => ({ ...f, fees: { ...f.fees, [key]: value } }));
  const { cycleUnit, cycleNum, settleLimit, guaranteeInsurance, fees, memo } = fields;

  // 초안 자동저장
  const { draft, saveDraft, clearDraft, savedAt } = useBidDraft(rfpId);
  const [showRestoreBanner, setShowRestoreBanner] = useState(draft !== null);
  useEffect(() => {
    saveDraft(fields);
  }, [fields]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRestore = () => {
    if (!draft) return;
    setFields(draft);
    setShowRestoreBanner(false);
  };
  const handleDismiss = () => {
    clearDraft();
    setShowRestoreBanner(false);
  };

  // 견적서 업로드
  const [proposal, setProposal] = useState<ProposalState>(null);
  const uploadProposal = async (file: File): Promise<void> => {
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

  const pct = (s: string) => parseFloat(s) / 100;
  const buildPaymentFees = (): Partial<Record<PaymentMethod, number | TierRates>> => {
    const out: Partial<Record<PaymentMethod, number | TierRates>> = {};
    for (const m of feeInputMethods) {
      if (isTieredMethod(m)) {
        const map: TierRates = {};
        for (const tier of MERCHANT_TIERS) {
          const v = fees[`${m}:${tier}`] ?? '';
          if (v !== '') map[tier] = pct(v);
        }
        if (Object.keys(map).length > 0) out[m] = map;
      } else {
        const v = fees[m] ?? '';
        if (v !== '') out[m] = pct(v);
      }
    }
    return out;
  };
  const fmtPct = (rate: number) => String(Math.round(rate * 1e6) / 1e4);
  const applyTemplate = (t: QuoteTemplateOption) => {
    clearDraft();
    setShowRestoreBanner(false);
    const m = /^([DWM])\+(\d+)$/.exec(t.settleCycle);
    const unit = (m?.[1] ?? 'D') as 'D' | 'W' | 'M';
    const num = m?.[2] ?? '1';
    setFields((f) => {
      const nextFees = { ...f.fees };
      for (const method of feeInputMethods) {
        const val = t.paymentFees[method];
        if (val === undefined) continue;
        if (typeof val === 'object') {
          for (const tier of MERCHANT_TIERS) {
            const r = val[tier];
            if (r !== undefined) nextFees[`${method}:${tier}`] = fmtPct(r);
          }
        } else if (isTieredMethod(method)) {
          // 구버전 단일요율 템플릿 → 전 구간 동일값으로 전개
          for (const tier of MERCHANT_TIERS) nextFees[`${method}:${tier}`] = fmtPct(val);
        } else {
          nextFees[method] = fmtPct(val);
        }
      }
      return { ...f, cycleUnit: unit, cycleNum: num, settleLimit: String(t.settleLimit), guaranteeInsurance: String(t.guaranteeInsurance), fees: nextFees };
    });
  };

  // 단계 이동 — 자유 점프(구매사 위저드 미러)
  const completed = getBidWizardValidity({ cycleNum, anyFeeFilled }).map((s) => s.complete);
  const advance = () => setCurrentStep((s) => Math.min(TOTAL_STEPS, s + 1));
  const back = () => setCurrentStep((s) => Math.max(1, s - 1));
  const goToStep = (step: number) => setCurrentStep(Math.min(TOTAL_STEPS, Math.max(1, step)));

  const onSaveTemplate = async (name: string) => {
    const r = await saveQuoteTemplateAction({
      name,
      settleCycle,
      settleLimit: parseInt(settleLimit) || 0,
      guaranteeInsurance: parseInt(guaranteeInsurance) || 0,
      paymentFees: buildPaymentFees(),
    });
    return r.ok ? { ok: true as const } : { ok: false as const, error: r.error };
  };

  const handleSubmit = () => {
    // 발송 버튼은 막지 않되, 미충족 단계가 있으면 그 단계로 이동.
    const incomplete = getFirstIncompleteBidStep({ cycleNum, anyFeeFilled });
    if (incomplete) {
      setCurrentStep(incomplete.num);
      return;
    }
    setSubmitError(null);
    setSubmitConfirmOpen(true);
  };

  const doSubmit = () => {
    setSubmitConfirmOpen(false);
    const paymentFees = buildPaymentFees();
    const customFees: Record<string, number> = {};
    for (const c of customPaymentMethods) {
      const v = fees[c.id] ?? '';
      if (v !== '') customFees[c.id] = pct(v);
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

      {currentStep === 1 && showRestoreBanner && (
        <div className="mb-4 flex items-center justify-between px-4 py-2.5 border border-[var(--md-sys-color-secondary-container)] rounded-[6px] bg-[var(--md-sys-color-secondary-container)]">
          <span className="text-[13px] text-[var(--md-sys-color-on-secondary-container)]">이전에 작성 중이던 내용이 있습니다</span>
          <div className="flex gap-2">
            <button type="button" onClick={handleRestore} className="text-[12px] text-[var(--md-sys-color-on-secondary-container)] underline underline-offset-2">불러오기</button>
            <button type="button" onClick={handleDismiss} className="text-[12px] text-[var(--md-sys-color-on-surface-variant)]">무시</button>
          </div>
        </div>
      )}

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
              savedAt ? (
                <span className="font-mono text-[10px] text-[var(--md-sys-color-outline)]">
                  💾 자동저장됨 · {savedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
                </span>
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
                <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
              </div>

              {currentStep === 1 && (
                <div className="space-y-8">
                  {templates.length > 0 && (
                    <div className="space-y-1">
                      <Label size="md" muted={false}>견적 템플릿 불러오기</Label>
                      <Select
                        options={[{ value: '', label: '템플릿 선택…' }, ...templates.map((t) => ({ value: t.id, label: t.name }))]}
                        value=""
                        onChange={(id) => {
                          const t = templates.find((x) => x.id === id);
                          if (t) applyTemplate(t);
                        }}
                      />
                    </div>
                  )}
                  <BidStepSettlement
                    cycleUnit={cycleUnit}
                    cycleNum={cycleNum}
                    settleLimit={settleLimit}
                    guaranteeInsurance={guaranteeInsurance}
                    onField={setField}
                    onNext={advance}
                  />
                </div>
              )}

              {currentStep === 2 && (
                <BidStepFees
                  feeInputMethods={feeInputMethods}
                  customPaymentMethods={customPaymentMethods}
                  fees={fees}
                  onFee={setFee}
                  onBack={back}
                  onNext={advance}
                />
              )}

              {currentStep === 3 && (
                <BidStepProposal
                  proposal={proposal}
                  memo={memo}
                  onUpload={(f) => void uploadProposal(f)}
                  onClear={() => setProposal(null)}
                  onMemoChange={(v) => setField('memo', v)}
                  onBack={back}
                  onNext={advance}
                />
              )}

              {currentStep === 4 && (
                <BidStepReview
                  settleCycle={settleCycle}
                  settleLimit={settleLimit}
                  guaranteeInsurance={guaranteeInsurance}
                  feeInputMethods={feeInputMethods}
                  customPaymentMethods={customPaymentMethods}
                  fees={fees}
                  canSubmit={canSubmit}
                  pending={pending}
                  submitError={submitError}
                  onBack={back}
                  onSubmit={handleSubmit}
                  onSaveTemplate={onSaveTemplate}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
