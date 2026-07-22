'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/primitives/Button';
import { Label } from '@/components/primitives/Label';
import { cn } from '@/lib/utils';

// Slim BizProfile-shaped result (matches lib/types/biz-profile + DB schema).
// The component owns no data fetching — callers inject `onLookup` (실서비스는
// components/rfp/nts-lookup.ts 의 공용 어댑터 `ntsLookup`).
export type BizLookupResult = {
  bizNo: string;
  taxType: 'general' | 'simple' | 'exempt';
  status: 'active' | 'suspended' | 'closed';
};

// onLookup 응답 계약의 단일 출처 — 공용 어댑터(nts-lookup.ts)와 테스트가 공유.
export type LookupResponse =
  | { valid: true; taxType: 'general' | 'simple' | 'exempt'; status: 'active' | 'suspended' | 'closed' }
  | { valid: false; error?: string };

type Status = 'idle' | 'loading' | 'found' | 'notfound';

type Props = {
  /** 호출측 주입 조회 함수 — 실서비스는 공용 어댑터 `ntsLookup` 을 주입한다. */
  onLookup: (bizNo: string) => Promise<LookupResponse>;
  onResult: (profile: BizLookupResult) => void;
  onReset: () => void;
  /**
   * 패널을 보여주되 onResult 를 차단할 상태 목록. 기본 [] — 지정하지 않으면
   * 기존 동작(모든 유효 조회 결과를 onResult 로 전달)이 유지된다.
   * 구매자 가입 폼에서는 ['closed', 'suspended'] 를 전달한다.
   */
  blockedStatuses?: BizLookupResult['status'][];
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

export function BizLookupField({ onLookup, onResult, onReset, blockedStatuses = [] }: Props) {
  const [raw, setRaw] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<BizLookupResult | null>(null);
  const [error, setError] = useState('');

  const formatted = formatBizNo(raw);
  const isComplete = formatted.replace(/-/g, '').length === 10;

  // 단조 증가 시퀀스 — 입력 수정/리셋 시 bump 해서 in-flight 응답을 무효화.
  // 없으면 조회 중 번호를 고치고 나서 이전 번호의 결과가 뒤늦게 found 로
  // 덮어써 화면 입력값과 onResult 로 커밋된 번호가 어긋난다.
  const lookupSeqRef = useRef(0);

  const handleLookup = async () => {
    if (!isComplete || status === 'loading') return;
    const seq = ++lookupSeqRef.current;
    setStatus('loading');
    setError('');
    try {
      const response = await onLookup(formatted);
      if (seq !== lookupSeqRef.current) return; // stale 응답 폐기
      if (response.valid) {
        const profile: BizLookupResult = {
          bizNo: formatted,
          taxType: response.taxType,
          status: response.status,
        };
        setResult(profile);
        setStatus('found');
        if (blockedStatuses.includes(response.status)) {
          // 패널은 렌더(status='found')하되 onResult를 호출하지 않아 부모의
          // bizProfile 이 null 로 유지된다 → canSubmit 게이트 자동 비활성화.
          // 가입 폼과 설정의 사업자번호 변경 폼이 같은 문구를 공유하므로
          // '가입'이 아니라 문맥 중립적인 '사용'으로 안내한다.
          setError(
            `${STATUS_LABEL[response.status]} 상태인 사업자번호는 사용할 수 없어요. 정상 영업 중인 사업자번호를 입력해주세요.`,
          );
        } else {
          onResult(profile);
        }
      } else {
        setResult(null);
        setStatus('notfound');
        setError(response.error ?? '사업자번호를 찾지 못했어요.');
      }
    } catch {
      if (seq !== lookupSeqRef.current) return; // stale 오류도 폐기
      setStatus('idle');
      setError('조회 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.');
    }
  };

  const handleReset = () => {
    lookupSeqRef.current += 1;
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
              lookupSeqRef.current += 1; // 진행 중 조회 무효화
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
              'flex-1 bg-transparent border-0 border-b py-2 text-[14px] md-numeric text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] focus:outline-none transition-colors',
              status === 'found'
                ? 'border-[var(--md-sys-color-on-surface)] opacity-60'
                : 'border-[var(--md-sys-color-outline)] focus:border-[var(--md-sys-color-on-surface)]',
            )}
          />
          {status === 'found' ? (
            <button
              type="button"
              onClick={handleReset}
              className="md-label-small text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-error)] transition-colors pb-2"
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
            className="md-label-small text-[var(--md-sys-color-error)]"
          >
            {error}
          </p>
        )}
      </div>

      {status === 'found' && result && (
        <div className="border border-[var(--md-sys-color-outline-variant)] divide-y divide-[var(--md-sys-color-outline-variant)]">
          <div className="px-4 py-2 flex items-center justify-between">
            <span className="md-label-small text-[var(--md-sys-color-on-surface-variant)]">
              NTS — 국세청 자동 조회
            </span>
            {!blockedStatuses.includes(result.status) && (
              <span className="md-label-small text-[var(--md-sys-color-tertiary)]">
                ✓ 확인됨
              </span>
            )}
          </div>
          {([
            ['사업자번호', result.bizNo],
            ['과세 유형', TAX_TYPE_LABEL[result.taxType]],
            ['사업자 상태', STATUS_LABEL[result.status], blockedStatuses.includes(result.status)],
          ] as [string, string, boolean?][]).map(([label, value, isError]) => (
            <div
              key={label}
              className="px-4 py-2.5 flex items-baseline justify-between"
            >
              <span className="md-label-small text-[var(--md-sys-color-on-surface-variant)]">
                {label}
              </span>
              <span className={cn(
                'text-[13px] font-medium md-numeric',
                isError
                  ? 'text-[var(--md-sys-color-error)]'
                  : 'text-[var(--md-sys-color-on-surface)]',
              )}>
                {value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
