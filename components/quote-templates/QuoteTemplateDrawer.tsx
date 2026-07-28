'use client';

import { useEffect, useState, useTransition } from 'react';
import { Button } from '@/components/primitives/Button';
import { Label } from '@/components/primitives/Label';
import { CurrencyInput, DayOffsetInput, PercentInput, numericInputClass, underlineInputClass } from '@/components/forms/inputs';
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { saveQuoteTemplateAction } from '@/lib/server/actions/quote-template/saveQuoteTemplateAction';
import {
  PAYMENT_METHOD_CATEGORIES,
  PAYMENT_METHOD_LABELS,
  MERCHANT_TIERS,
  MERCHANT_TIER_LABELS,
  isTieredMethod,
  isFlatFeeMethod,
  type PaymentMethod,
  type QuoteTemplateOption,
} from '@/lib/types/bid';
import { isSettleLimitValid } from '@/components/inbox/bid-wizard/bid-wizard-validation';
import { quoteTemplateErrorMessage } from '@/lib/quote/error-messages';
import { buildPaymentFees, templateFeesToFlat } from '@/lib/quote/template-fees';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

const ALL_PAYMENT_METHODS: PaymentMethod[] = PAYMENT_METHOD_CATEGORIES.flatMap(
  (c) => c.methods,
);

type EditorState = {
  id?: string;
  name: string;
  settleCycle: string;
  settleLimit: string;
  guaranteeInsurance: string;
  signupFee: string;
  /** flat fees map: "method" → pct string for single-rate, "method:tier" → pct string for tiered */
  fees: Record<string, string>;
};

function blankEditor(): EditorState {
  return {
    name: '',
    settleCycle: 'D+1',
    // 정산한도는 0 초과 필수라 '0' 프리필은 사용자가 먼저 지워야 하는 무효값이다
    // (견적 위저드의 EMPTY_BID_DRAFT 와 같은 이유). 빈 값이면 placeholder 가 보인다.
    settleLimit: '',
    guaranteeInsurance: '0',
    signupFee: '0',
    fees: {},
  };
}

function editorFromTemplate(t: QuoteTemplateOption): EditorState {
  return {
    id: t.id,
    name: t.name,
    settleCycle: t.settleCycle,
    settleLimit: String(t.settleLimit),
    guaranteeInsurance: String(t.guaranteeInsurance),
    signupFee: String(t.signupFee),
    fees: templateFeesToFlat(t.paymentFees, ALL_PAYMENT_METHODS),
  };
}

export function QuoteTemplateDrawer({
  open,
  onClose,
  template,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  template: QuoteTemplateOption | null;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [editor, setEditor] = useState<EditorState>(() =>
    template ? editorFromTemplate(template) : blankEditor(),
  );
  const [error, setError] = useState<string | null>(null);
  const [settleLimitTouched, setSettleLimitTouched] = useState(false);

  // Reset form when drawer opens or template changes
  useEffect(() => {
    if (open) {
      /* eslint-disable react-hooks/set-state-in-effect -- 드로어 열림/템플릿 변경 시 폼을 1회 리셋하는 의도된 동기화 */
      setEditor(template ? editorFromTemplate(template) : blankEditor());
      setError(null);
      setSettleLimitTouched(false);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [open, template]);

  if (!open) return null;

  const setFee = (key: string, value: string) =>
    setEditor((e) => ({ ...e, fees: { ...e.fees, [key]: value } }));
  const setField = <K extends keyof EditorState>(key: K, value: EditorState[K]) =>
    setEditor((e) => ({ ...e, [key]: value }));

  // 견적 위저드와 같은 기준(0 초과)을 쓴다. 템플릿은 견적 폼의 프리필이라
  // 기준이 갈리면 저장은 되는데 불러오면 막히는 템플릿이 생긴다.
  const settleLimitValid = isSettleLimitValid(editor.settleLimit);
  // 위저드는 제출 시도(attempted)를 빨강의 방아쇠로 쓰지만, 드로어의 저장 버튼은
  // 무효일 때 disabled 라 '시도'가 성립하지 않는다 — touched 로 맞춘다. 단 빈 값이
  // 아닌 무효값(0 이 든 기존 템플릿)은 만지기 전에도 짚어야 저장이 잠긴 이유가 보인다.
  const showSettleLimitError =
    !settleLimitValid && (settleLimitTouched || editor.settleLimit !== '');

  const handleSave = () => {
    const name = editor.name.trim();
    if (!name || !settleLimitValid) return;
    setError(null);

    const settleCycle = editor.settleCycle || 'D+1';
    const paymentFees = buildPaymentFees(editor.fees, ALL_PAYMENT_METHODS);
    const base = {
      name,
      settleCycle,
      settleLimit: parseInt(editor.settleLimit) || 0,
      guaranteeInsurance: parseInt(editor.guaranteeInsurance) || 0,
      signupFee: parseInt(editor.signupFee) || 0,
      paymentFees,
    };

    startTransition(async () => {
      const r = await saveQuoteTemplateAction(
        editor.id ? { id: editor.id, ...base } : base,
      );
      if (r.ok) {
        // 저장하면 드로어가 닫혀 인라인 확인이 사라진다 — 토스트가 유일한 피드백.
        toast('템플릿을 저장했어요', { type: 'success' });
        onSaved();
      } else {
        setError(r.error);
      }
    });
  };

  const title = template ? '템플릿 편집' : '새 템플릿';

  // 스크림·Esc·포커스 트랩·닫기 버튼은 Sheet(base-ui Dialog)가 소유한다 —
  // 예전엔 role="dialog" aria-modal 만 손으로 붙어 있고 실제 모달 동작이 없었다.
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="gap-0 bg-[var(--md-sys-color-surface)] sm:max-w-md"
      >
        <SheetHeader className="border-b border-[var(--md-sys-color-outline-variant)] px-5 py-4">
          <SheetTitle className="text-[16px] font-[600] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
            {title}
          </SheetTitle>
        </SheetHeader>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {error && (
          <p className="md-label-small text-[var(--md-sys-color-error)]">
            {quoteTemplateErrorMessage(error, '템플릿을 저장하지 못했어요')}
          </p>
        )}

        {/* Template name */}
        <div className="space-y-1">
          <Label as="label" htmlFor="quote-template-name" size="md" muted={false}>
            템플릿 이름 *
          </Label>
          <input
            id="quote-template-name"
            value={editor.name}
            onChange={(e) => setField('name', e.target.value)}
            placeholder="템플릿 이름"
            maxLength={80}
            className={cn(underlineInputClass)}
          />
        </div>

        {/* Settlement cycle + limits */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-5">
          <div className="col-span-2">
            <DayOffsetInput
              label="정산 주기 *"
              value={editor.settleCycle}
              onChange={(v) => setField('settleCycle', v || 'D+1')}
              placeholder="1"
            />
          </div>
          <CurrencyInput
            label="정산한도 (원/월)"
            value={editor.settleLimit}
            onChange={(v) => {
              setSettleLimitTouched(true);
              setField('settleLimit', v);
            }}
            placeholder="50,000,000"
            error={showSettleLimitError ? '정산한도를 입력해주세요' : undefined}
          />
          <CurrencyInput
            label="월 보증보험 (원/연)"
            value={editor.guaranteeInsurance}
            onChange={(v) => setField('guaranteeInsurance', v)}
            placeholder="0"
          />
          <CurrencyInput
            label="가입비 (원/최초 1회)"
            value={editor.signupFee}
            onChange={(v) => setField('signupFee', v)}
            placeholder="0"
          />
        </div>

        {/* Payment fees */}
        <div className="space-y-3">
          <span className="md-label-small text-[var(--md-sys-color-on-surface-variant)]">
            결제수단별 수수료
          </span>
          <div className="space-y-5">
            {ALL_PAYMENT_METHODS.map((method) => {
              if (isTieredMethod(method)) {
                // 5-tier grid
                return (
                  <div key={method} className="space-y-2">
                    <span className="md-label-small text-[var(--md-sys-color-on-surface-variant)]">
                      {PAYMENT_METHOD_LABELS[method]} 수수료 (구간별)
                    </span>
                    <div className="grid grid-cols-5 gap-2">
                      {MERCHANT_TIERS.map((tier) => (
                        <div key={tier} className="space-y-1">
                          <span className="md-label-small text-[var(--md-sys-color-on-surface-variant)]">
                            {MERCHANT_TIER_LABELS[tier]}
                          </span>
                          <div className="flex items-end gap-0.5">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={editor.fees[`${method}:${tier}`] ?? ''}
                              onChange={(e) => setFee(`${method}:${tier}`, e.target.value)}
                              placeholder="0.00"
                              className={cn(numericInputClass, 'flex-1 min-w-0')}
                            />
                            <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] pb-2">
                              %
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }

              // 정액(건당) 수단 — % 가 아니라 건당 '원' 정수로 입력받는다.
              if (isFlatFeeMethod(method)) {
                return (
                  <CurrencyInput
                    key={method}
                    label={`${PAYMENT_METHOD_LABELS[method]} 건당 수수료`}
                    value={editor.fees[method] ?? ''}
                    onChange={(v) => setFee(method, v)}
                  />
                );
              }

              // Single-rate (정률) method
              return (
                <PercentInput
                  key={method}
                  label={`${PAYMENT_METHOD_LABELS[method]} 수수료`}
                  value={editor.fees[method] ?? ''}
                  onChange={(v) => setFee(method, v)}
                />
              );
            })}
          </div>
        </div>
      </div>

        {/* Footer — 긍정 버튼이 오른쪽(UX_WRITING §6, ConfirmDialog 와 같은 순서). */}
        <SheetFooter className="flex-row justify-end gap-2 border-t border-[var(--md-sys-color-outline-variant)] px-5 py-4">
          <Button type="button" size="sm" variant="text" onClick={onClose}>
            취소
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={!editor.name.trim() || !settleLimitValid || pending}
          >
            저장
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
