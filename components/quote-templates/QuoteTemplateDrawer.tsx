'use client';

import { useEffect, useState, useTransition } from 'react';
import { Button } from '@/components/primitives/Button';
import { Label } from '@/components/primitives/Label';
import { CurrencyInput, DayOffsetInput, PercentInput, numericInputClass, underlineInputClass } from '@/components/forms/inputs';
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
import { buildPaymentFees, templateFeesToFlat } from '@/lib/quote/template-fees';
import { cn } from '@/lib/utils';

const ALL_PAYMENT_METHODS: PaymentMethod[] = PAYMENT_METHOD_CATEGORIES.flatMap(
  (c) => c.methods,
);

const ERROR_LABELS: Record<string, string> = {
  INVALID_INPUT: '입력 값을 확인해주세요.',
  LIMIT_REACHED: '템플릿은 최대 20개까지 저장할 수 있어요.',
  FORBIDDEN: '권한이 없습니다.',
  TEMPLATE_NOT_FOUND: '템플릿을 찾을 수 없습니다.',
};

type EditorState = {
  id?: string;
  name: string;
  settleCycle: string;
  settleLimit: string;
  guaranteeInsurance: string;
  /** flat fees map: "method" → pct string for single-rate, "method:tier" → pct string for tiered */
  fees: Record<string, string>;
};

function blankEditor(): EditorState {
  return {
    name: '',
    settleCycle: 'D+1',
    settleLimit: '0',
    guaranteeInsurance: '0',
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

  // Reset form when drawer opens or template changes
  useEffect(() => {
    if (open) {
      /* eslint-disable react-hooks/set-state-in-effect -- 드로어 열림/템플릿 변경 시 폼을 1회 리셋하는 의도된 동기화 */
      setEditor(template ? editorFromTemplate(template) : blankEditor());
      setError(null);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [open, template]);

  if (!open) return null;

  const setFee = (key: string, value: string) =>
    setEditor((e) => ({ ...e, fees: { ...e.fees, [key]: value } }));
  const setField = <K extends keyof EditorState>(key: K, value: EditorState[K]) =>
    setEditor((e) => ({ ...e, [key]: value }));

  const handleSave = () => {
    const name = editor.name.trim();
    if (!name) return;
    setError(null);

    const settleCycle = editor.settleCycle || 'D+1';
    const paymentFees = buildPaymentFees(editor.fees, ALL_PAYMENT_METHODS);
    const base = {
      name,
      settleCycle,
      settleLimit: parseInt(editor.settleLimit) || 0,
      guaranteeInsurance: parseInt(editor.guaranteeInsurance) || 0,
      paymentFees,
    };

    startTransition(async () => {
      const r = await saveQuoteTemplateAction(
        editor.id ? { id: editor.id, ...base } : base,
      );
      if (r.ok) {
        onSaved();
      } else {
        setError(r.error);
      }
    });
  };

  const title = template ? '템플릿 편집' : '새 템플릿';

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-y-0 right-0 z-50 flex flex-col w-full max-w-md bg-[var(--md-sys-color-surface)] border-l border-[var(--md-sys-color-outline-variant)] shadow-lg overflow-y-auto"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--md-sys-color-outline-variant)]">
        <h2 className="text-[16px] font-[600] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
          {title}
        </h2>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {error && (
          <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-error)]">
            {ERROR_LABELS[error] ?? error}
          </p>
        )}

        {/* Template name */}
        <div className="space-y-1">
          <Label size="md" muted={false}>템플릿 이름 *</Label>
          <input
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
            onChange={(v) => setField('settleLimit', v)}
            placeholder="0"
          />
          <CurrencyInput
            label="월 보증보험 (원/연)"
            value={editor.guaranteeInsurance}
            onChange={(v) => setField('guaranteeInsurance', v)}
            placeholder="0"
          />
        </div>

        {/* Payment fees */}
        <div className="space-y-3">
          <span className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
            결제수단별 수수료
          </span>
          <div className="space-y-5">
            {ALL_PAYMENT_METHODS.map((method) => {
              if (isTieredMethod(method)) {
                // 5-tier grid
                return (
                  <div key={method} className="space-y-2">
                    <span className="font-mono text-[10px] tracking-[0.08em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
                      {PAYMENT_METHOD_LABELS[method]} 수수료 (구간별)
                    </span>
                    <div className="grid grid-cols-5 gap-2">
                      {MERCHANT_TIERS.map((tier) => (
                        <div key={tier} className="space-y-1">
                          <span className="font-mono text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
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
                            <span className="font-mono text-[11px] text-[var(--md-sys-color-on-surface-variant)] pb-2">
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

      {/* Footer */}
      <div className="px-5 py-4 border-t border-[var(--md-sys-color-outline-variant)] flex gap-2">
        <Button
          type="button"
          size="sm"
          onClick={handleSave}
          disabled={!editor.name.trim() || pending}
        >
          저장
        </Button>
        <Button
          type="button"
          size="sm"
          variant="text"
          onClick={onClose}
        >
          취소
        </Button>
      </div>
    </div>
  );
}
