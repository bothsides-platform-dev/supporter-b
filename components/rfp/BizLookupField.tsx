'use client';

import { useState } from 'react';
import { Button } from '@/components/primitives/Button';
import { Label } from '@/components/primitives/Label';
import { cn } from '@/lib/utils';

// Slim BizProfile-shaped result (matches lib/types/biz-profile + DB schema).
// The component owns no mock import — callers inject `onLookup` so Step 7 can
// swap the live `lookupBizNoAction` in without touching this file.
export type BizLookupResult = {
  bizNo: string;
  taxType: 'general' | 'simple' | 'exempt';
  status: 'active' | 'suspended' | 'closed';
};

type LookupResponse =
  | { valid: true; taxType: 'general' | 'simple' | 'exempt'; status: 'active' | 'suspended' | 'closed' }
  | { valid: false; taxType?: undefined; status?: undefined };

type Status = 'idle' | 'loading' | 'found' | 'notfound';

type Props = {
  /**
   * Caller-supplied lookup. Step 7 will inject `lookupBizNoAction` at call
   * sites; for now sign-up + RFP-create use a stub.
   */
  onLookup: (bizNo: string) => Promise<LookupResponse>;
  onResult: (profile: BizLookupResult) => void;
  onReset: () => void;
};

function formatBizNo(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

const TAX_TYPE_LABEL: Record<BizLookupResult['taxType'], string> = {
  general: '일반과세',
  simple: '간이과세',
  exempt: '면세',
};

const STATUS_LABEL: Record<BizLookupResult['status'], string> = {
  active: '정상',
  suspended: '휴업',
  closed: '폐업',
};

export function BizLookupField({ onLookup, onResult, onReset }: Props) {
  const [raw, setRaw] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<BizLookupResult | null>(null);
  const [error, setError] = useState('');

  const formatted = formatBizNo(raw);
  const isComplete = formatted.replace(/-/g, '').length === 10;

  const handleLookup = async () => {
    if (!isComplete) return;
    setStatus('loading');
    setError('');
    const response = await onLookup(formatted);
    if (response.valid) {
      const profile: BizLookupResult = {
        bizNo: formatted,
        taxType: response.taxType,
        status: response.status,
      };
      setResult(profile);
      setStatus('found');
      onResult(profile);
    } else {
      setResult(null);
      setStatus('notfound');
      setError('등록된 사업자번호가 없습니다.');
    }
  };

  const handleReset = () => {
    setRaw('');
    setStatus('idle');
    setResult(null);
    setError('');
    onReset();
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label size="md" muted={false}>사업자 등록번호</Label>
        <div className="flex items-end gap-3">
          <input
            type="text"
            value={formatted}
            onChange={(e) => {
              setRaw(e.target.value);
              if (status !== 'idle') {
                setStatus('idle');
                setResult(null);
                onReset();
              }
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
            disabled={status === 'found'}
            placeholder="000-00-00000"
            aria-label="사업자 등록번호"
            className={cn(
              'flex-1 bg-transparent border-0 border-b py-2 text-[14px] font-mono tabular-nums text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] focus:outline-none transition-colors',
              status === 'found'
                ? 'border-[var(--md-sys-color-on-surface)] opacity-60'
                : 'border-[var(--md-sys-color-outline)] focus:border-[var(--md-sys-color-on-surface)]',
            )}
          />
          {status === 'found' ? (
            <button
              type="button"
              onClick={handleReset}
              className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-error)] transition-colors pb-2"
            >
              초기화
            </button>
          ) : (
            <Button
              type="button"
              variant="outlined"
              size="sm"
              disabled={!isComplete || status === 'loading'}
              onClick={handleLookup}
            >
              {status === 'loading' ? '조회 중…' : '조회'}
            </Button>
          )}
        </div>
        {error && (
          <p
            role="alert"
            className="font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--md-sys-color-error)]"
          >
            {error}
          </p>
        )}
      </div>

      {status === 'found' && result && (
        <div className="border border-[var(--md-sys-color-outline-variant)] divide-y divide-[var(--md-sys-color-outline-variant)]">
          <div className="px-4 py-2 flex items-center justify-between">
            <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
              NTS — 국세청 자동 조회
            </span>
            <span className="font-mono text-[10px] tracking-[0.1em] text-[var(--md-sys-color-tertiary)]">
              ✓ 확인됨
            </span>
          </div>
          {[
            ['사업자번호', result.bizNo],
            ['과세 유형', TAX_TYPE_LABEL[result.taxType]],
            ['사업자 상태', STATUS_LABEL[result.status]],
          ].map(([label, value]) => (
            <div
              key={label}
              className="px-4 py-2.5 flex items-baseline justify-between"
            >
              <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
                {label}
              </span>
              <span className="text-[13px] text-[var(--md-sys-color-on-surface)] font-medium font-mono tabular-nums">
                {value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
