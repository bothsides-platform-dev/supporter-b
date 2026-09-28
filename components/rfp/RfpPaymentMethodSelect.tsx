// components/rfp/RfpPaymentMethodSelect.tsx
'use client';

import { useId, useState } from 'react';
import Image from 'next/image';
import { ArrowLeftRight, CreditCard, Gift, Globe2, Landmark, Smartphone, X, type LucideIcon } from 'lucide-react';
import { Label } from '@/components/primitives/Label';
import { underlineInputClass } from '@/components/forms/inputs';
import {
  PAYMENT_METHOD_CATEGORIES,
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
} from '@/lib/types/bid';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';
import { cn } from '@/lib/utils';
import { RequiredMark } from './RequiredMark';
import { FieldError } from '@/components/primitives/FieldError';
import type { MarkerState } from '@/lib/rfp/required-fields';

const MAX_CUSTOM = 20;

type MethodIcon =
  | { kind: 'symbol'; icon: LucideIcon; badgeClass: string }
  | { kind: 'brand'; src: string; badgeClass: string; imageClass?: string };

const METHOD_ICONS: Record<PaymentMethod, MethodIcon> = {
  card: { kind: 'symbol', icon: CreditCard, badgeClass: 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-primary)]' },
  overseas_card: { kind: 'symbol', icon: Globe2, badgeClass: 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-primary)]' },
  virtual_account: { kind: 'symbol', icon: Landmark, badgeClass: 'bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)]' },
  bank_transfer: { kind: 'symbol', icon: ArrowLeftRight, badgeClass: 'bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)]' },
  naver_pay: { kind: 'brand', src: '/landing/payment-methods/naver.svg', badgeClass: 'bg-[#03C75A]', imageClass: 'invert' },
  kakao_pay: { kind: 'brand', src: '/landing/payment-methods/kakao-pay.png', badgeClass: 'bg-[#FFEB00]', imageClass: 'w-5 object-contain' },
  toss_pay: { kind: 'brand', src: '/landing/payment-methods/toss-pay.png', badgeClass: 'bg-white', imageClass: 'size-5 object-contain' },
  apple_pay: { kind: 'brand', src: '/landing/payment-methods/apple-pay.svg', badgeClass: 'bg-white' },
  samsung_pay: { kind: 'brand', src: '/landing/payment-methods/samsung-pay.svg', badgeClass: 'bg-[#1428A0]', imageClass: 'invert' },
  mobile: { kind: 'symbol', icon: Smartphone, badgeClass: 'bg-[var(--md-sys-color-warning-container)] text-[var(--md-sys-color-on-warning-container)]' },
  gift_card: { kind: 'symbol', icon: Gift, badgeClass: 'bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]' },
};

function PaymentMethodIcon({ method }: { method: PaymentMethod }) {
  const definition = METHOD_ICONS[method];
  return (
    <span aria-hidden="true" className={cn('grid size-6 shrink-0 place-items-center rounded-[var(--md-sys-shape-small)]', definition.badgeClass)}>
      {definition.kind === 'symbol'
        ? <definition.icon className="size-4" strokeWidth={1.7} />
        : <Image src={definition.src} alt="" width={20} height={20} className={cn('max-h-5 max-w-5 object-contain', definition.imageClass)} />}
    </span>
  );
}

type Props = {
  showFieldLabel?: boolean;
  markerState?: MarkerState;
  /** step 게이트 미충족 시 결제수단 안내 에러를 표시 */
  error?: boolean;
};

export function RfpPaymentMethodSelect({ showFieldLabel = true, markerState, error }: Props = {}) {
  const draft = useRfpDraftStore();
  const [customInput, setCustomInput] = useState('');
  const customInputId = useId();

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
      {showFieldLabel && <div className="flex items-center gap-2">
        <Label size="md" muted={false}>견적 받을 결제수단</Label>
        {markerState && <RequiredMark state={markerState} />}
      </div>}
      {error && (
        <FieldError error="결제수단을 1개 이상 선택해주세요" />
      )}
      <div className="space-y-4">
        {PAYMENT_METHOD_CATEGORIES.map((category) => (
          <div key={category.label} className="grid gap-2 sm:grid-cols-[96px_minmax(0,1fr)] sm:items-start sm:gap-3">
            <span className="pt-2 text-[14px] text-[var(--md-sys-color-on-surface-variant)]">
              {category.label}
            </span>
            <div className="flex min-w-0 flex-wrap gap-2">
              {category.methods.map((method) => {
                const active = selected.includes(method);
                return (
                  <button
                    key={method}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggle(method)}
                    className={cn(
                      'inline-flex h-9 items-center gap-1.5 rounded-[var(--md-sys-shape-small)] px-2 text-[14px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-primary)]',
                      active
                        ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]'
                        : 'border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container)]',
                    )}
                  >
                    <PaymentMethodIcon method={method} />
                    {PAYMENT_METHOD_LABELS[method]}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2 border-t border-[var(--md-sys-color-outline-variant)] pt-4">
        <Label as="label" htmlFor={customInputId} size="md">목록에 없는 결제수단</Label>
        {custom.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {custom.map((item, index) => (
              <span
                key={`${item.label}-${index}`}
                className="inline-flex h-9 items-center gap-1 rounded-[var(--md-sys-shape-small)] bg-[var(--md-sys-color-primary)] pl-3 pr-1.5 text-[14px] text-[var(--md-sys-color-on-primary)]"
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
            id={customInputId}
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
            className={cn(underlineInputClass, 'min-w-0 flex-1')}
          />
          <button
            type="button"
            onClick={addCustom}
            disabled={customInput.trim() === '' || custom.length >= MAX_CUSTOM}
            className={cn(
              'h-9 shrink-0 rounded-[var(--md-sys-shape-small)] px-3 text-[14px]',
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
