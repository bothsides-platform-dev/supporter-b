'use client';

import { useState } from 'react';
import { Button } from '@/components/primitives/Button';
import { Label } from '@/components/primitives/Label';
import {
  BizLookupField,
  type BizLookupResult,
} from '@/components/rfp/BizLookupField';
import { lookupBizNoAction } from '@/lib/server/actions/rfp';

// Adapter: BizLookupField expects { valid, taxType?, status? }
// lookupBizNoAction returns { ok, valid?, taxType?, status?, error? }
const ntsLookup = async (bizNo: string) => {
  const r = await lookupBizNoAction(bizNo);
  if (!r.ok) {
    const msg =
      r.error === 'NTS_RATE_LIMIT'
        ? '요청이 너무 많아요. 잠시 후 다시 시도해주세요.'
        : '사업자번호 조회 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.';
    return { valid: false as const, error: msg };
  }
  if (!r.valid) return { valid: false as const };
  if (!r.taxType) {
    return { valid: false as const, error: '지원되지 않는 사업자 유형이에요. 고객센터로 문의해 주세요.' };
  }
  return { valid: true as const, taxType: r.taxType, status: r.status! };
};

type BizProfilePayload = {
  bizNo: string;
  taxType: 'general' | 'simple' | 'exempt';
  status: 'active' | 'suspended' | 'closed';
};

type Props = {
  onSubmit: (payload: {
    wsName: string;
    bizProfile: BizProfilePayload;
  }) => Promise<void>;
  submitting: boolean;
  error?: string;
};

export function BuyerWorkspaceForm({ onSubmit, submitting, error }: Props) {
  const [wsName, setWsName] = useState('');
  const [bizProfile, setBizProfile] = useState<BizLookupResult | null>(null);

  // 사업자번호 조회 완료 + 워크스페이스 이름 모두 있어야 제출 가능.
  // 등급(grade)은 admin 승인 시 지정하므로 가입 폼에서 수집하지 않는다.
  const canSubmit = wsName.trim() !== '' && bizProfile !== null && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    await onSubmit({
      wsName: wsName.trim(),
      bizProfile: {
        bizNo: bizProfile.bizNo,
        taxType: bizProfile.taxType,
        status: bizProfile.status,
      },
    });
  };

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <Label size="md" muted={false}>워크스페이스 이름 *</Label>
        <input
          type="text"
          value={wsName}
          onChange={(e) => setWsName(e.target.value)}
          placeholder="(주)샘플테크"
          className="block w-full bg-transparent border-0 border-b border-[var(--md-sys-color-outline)] py-2 text-[14px] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] focus:outline-none focus:border-[var(--md-sys-color-on-surface)] transition-colors"
        />
      </div>

      <BizLookupField
        onLookup={ntsLookup}
        onResult={(profile) => {
          setBizProfile(profile);
        }}
        onReset={() => {
          setBizProfile(null);
        }}
        blockedStatuses={['closed', 'suspended']}
      />

      {error && (
        <p
          role="alert"
          className="font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--md-sys-color-error)]"
        >
          {error}
        </p>
      )}

      <Button
        type="button"
        fullWidth
        size="lg"
        disabled={!canSubmit}
        onClick={handleSubmit}
      >
        {submitting ? 'LOADING…' : '워크스페이스 만들기'}
      </Button>
    </div>
  );
}
