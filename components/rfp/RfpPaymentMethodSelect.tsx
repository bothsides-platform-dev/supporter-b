// components/rfp/RfpPaymentMethodSelect.tsx
'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { Label } from '@/components/primitives/Label';
import { underlineInputClass } from '@/components/forms/inputs';
import {
  PAYMENT_METHOD_CATEGORIES,
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
} from '@/lib/types/bid';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';
import { cn } from '@/lib/utils';

const MAX_CUSTOM = 20;

type Props = {
  /** step 게이트 미충족 시 결제수단 안내 에러를 표시 */
  error?: boolean;
};

export function RfpPaymentMethodSelect({ error }: Props = {}) {
  const draft = useRfpDraftStore();
  const [customInput, setCustomInput] = useState('');

  const selected = draft.requiredPaymentMethods;
  const custom = draft.customPaymentMethods;

  const toggle = (method: PaymentMethod) => {
    draft.setField(
      'requiredPaymentMethods',
      selected.includes(method)
        ? selected.filter((m) => m !== method)
        : [...selected, method],
    );
  };

  const addCustom = () => {
    const label = customInput.trim();
    if (label === '' || custom.length >= MAX_CUSTOM) return;
    draft.setField('customPaymentMethods', [...custom, { label }]);
    setCustomInput('');
  };

  const removeCustom = (index: number) => {
    draft.setField(
      'customPaymentMethods',
      custom.filter((_, i) => i !== index),
    );
  };

  return (
    <div className="space-y-3">
      <Label size="md" muted={false}>
        견적 받을 결제수단 *
      </Label>
      {error && (
        <p className="text-[12px] text-[var(--md-sys-color-error)]">결제수단을 1개 이상 선택해주세요</p>
      )}
      <div className="space-y-3">
        {PAYMENT_METHOD_CATEGORIES.map((category) => (
          <div key={category.label} className="space-y-1.5">
            <span className="text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
              {category.label}
            </span>
            <div className="flex flex-wrap gap-2">
              {category.methods.map((method) => {
                const active = selected.includes(method);
                return (
                  <button
                    key={method}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggle(method)}
                    className={cn(
                      'rounded-[var(--md-sys-shape-small)] px-3 h-7 text-[13px]',
                      active
                        ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]'
                        : 'border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]',
                    )}
                  >
                    {PAYMENT_METHOD_LABELS[method]}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <span className="text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
          직접입력
        </span>
        {custom.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {custom.map((item, index) => (
              <span
                key={`${item.label}-${index}`}
                className="inline-flex items-center gap-1 rounded-[var(--md-sys-shape-small)] bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] pl-3 pr-1.5 h-7 text-[13px]"
              >
                {item.label}
                <button
                  type="button"
                  aria-label={`${item.label} 삭제`}
                  onClick={() => removeCustom(index)}
                  className="grid place-items-center size-4 rounded-full hover:bg-[var(--md-sys-color-on-primary)]/20"
                >
                  <X className="size-3" strokeWidth={1.5} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder="직접입력 (예: 포인트결제)"
            maxLength={50}
            className={underlineInputClass}
          />
          <button
            type="button"
            onClick={addCustom}
            disabled={customInput.trim() === '' || custom.length >= MAX_CUSTOM}
            className={cn(
              'rounded-[var(--md-sys-shape-small)] px-3 h-7 text-[13px] shrink-0',
              'border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)]',
              'hover:text-[var(--md-sys-color-on-surface)] disabled:opacity-40 disabled:pointer-events-none',
            )}
          >
            추가
          </button>
        </div>
      </div>
    </div>
  );
}
