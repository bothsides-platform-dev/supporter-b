'use client';

import { useEffect, useState, useTransition } from 'react';
import { Button } from '@/components/primitives/Button';
import { Label } from '@/components/primitives/Label';
import { Select } from '@/components/primitives/Select';
import { CurrencyInput, PercentInput, numericInputClass, underlineInputClass } from '@/components/forms/inputs';
import { saveQuoteTemplateAction } from '@/lib/server/actions/quote-template/saveQuoteTemplateAction';
import {
  PAYMENT_METHOD_CATEGORIES,
  PAYMENT_METHOD_LABELS,
  MERCHANT_TIERS,
  MERCHANT_TIER_LABELS,
  isTieredMethod,
  type PaymentMethod,
  type TierRates,
  type QuoteTemplateOption,
} from '@/lib/types/bid';
import { cn } from '@/lib/utils';

const ALL_PAYMENT_METHODS: PaymentMethod[] = PAYMENT_METHOD_CATEGORIES.flatMap(
  (c) => c.methods,
);

const CYCLE_UNITS = [
  { value: 'D', label: 'D+' },
  { value: 'W', label: 'W+' },
  { value: 'M', label: 'M+' },
] as const;

const ERROR_LABELS: Record<string, string> = {
  INVALID_INPUT: '입력 값을 확인해주세요.',
  LIMIT_REACHED: '템플릿은 최대 20개까지 저장할 수 있어요.',
  FORBIDDEN: '권한이 없습니다.',
  TEMPLATE_NOT_FOUND: '템플릿을 찾을 수 없습니다.',
};

type EditorState = {
  id?: string;
  name: string;
  cycleUnit: 'D' | 'W' | 'M';
  cycleNum: string;
  settleLimit: string;
  guaranteeInsurance: string;
  /** flat fees map: "method" → pct string for single-rate, "method:tier" → pct string for tiered */
  fees: Record<string, string>;
  /** tiered methods: original TierRates preserved for re-assembly on save */
  tieredFees: Partial<Record<PaymentMethod, TierRates>>;
};

const fmtPct = (rate: number) => String(Math.round(rate * 1e6) / 1e4);

function blankEditor(): EditorState {
  return {
    name: '',
    cycleUnit: 'D',
    cycleNum: '1',
    settleLimit: '0',
    guaranteeInsurance: '0',
    fees: {},
    tieredFees: {},
  };
}

function editorFromTemplate(t: QuoteTemplateOption): EditorState {
  const m = /^([DWM])\+(\d+)$/.exec(t.settleCycle);
  const fees: Record<string, string> = {};
  const tieredFees: Partial<Record<PaymentMethod, TierRates>> = {};

  for (const method of ALL_PAYMENT_METHODS) {
    const stored = t.paymentFees[method];
    if (stored === undefined) continue;
    if (typeof stored === 'object') {
      // TierRates: store individual tier values as "method:tier" keys
      tieredFees[method] = stored;
      for (const tier of MERCHANT_TIERS) {
        const tierVal = stored[tier];
        if (tierVal !== undefined) {
          fees[`${method}:${tier}`] = fmtPct(tierVal);
        }
      }
    } else {
      fees[method] = fmtPct(stored);
    }
  }

  return {
    id: t.id,
    name: t.name,
    cycleUnit: (m?.[1] ?? 'D') as 'D' | 'W' | 'M',
    cycleNum: m?.[2] ?? '1',
    settleLimit: String(t.settleLimit),
    guaranteeInsurance: String(t.guaranteeInsurance),
    fees,
    tieredFees,
  };
}

function buildPaymentFees(
  fees: Record<string, string>,
  tieredFees: Partial<Record<PaymentMethod, TierRates>>,
): Partial<Record<PaymentMethod, number | TierRates>> {
  const result: Partial<Record<PaymentMethod, number | TierRates>> = {};

  for (const method of ALL_PAYMENT_METHODS) {
    if (tieredFees[method]) {
      // Re-assemble TierRates from "method:tier" keys
      const tiers: TierRates = {};
      let hasAny = false;
      for (const tier of MERCHANT_TIERS) {
        const v = fees[`${method}:${tier}`] ?? '';
        if (v !== '') {
          tiers[tier] = parseFloat(v) / 100;
          hasAny = true;
        }
      }
      if (hasAny) result[method] = tiers;
    } else {
      const v = fees[method] ?? '';
      if (v !== '') result[method] = parseFloat(v) / 100;
    }
  }

  return result;
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
      setEditor(template ? editorFromTemplate(template) : blankEditor());
      setError(null);
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

    const settleCycle = `${editor.cycleUnit}+${editor.cycleNum || '1'}`;
    const paymentFees = buildPaymentFees(editor.fees, editor.tieredFees);
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
          <div className="col-span-2 space-y-1">
            <Label size="md" muted={false}>정산 주기 *</Label>
            <div className="flex items-end gap-2">
              <div className="w-28">
                <Select
                  options={CYCLE_UNITS.map((u) => ({ value: u.value, label: u.label }))}
                  value={editor.cycleUnit}
                  onChange={(v) => setField('cycleUnit', v as 'D' | 'W' | 'M')}
                />
              </div>
              <input
                type="number"
                min="1"
                max="99"
                value={editor.cycleNum}
                onChange={(e) => setField('cycleNum', e.target.value)}
                placeholder="1"
                className={cn(numericInputClass, 'flex-1')}
              />
            </div>
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
              const isT = isTieredMethod(method) && editor.tieredFees[method];
              if (isT) {
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

              // Single-rate method
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
