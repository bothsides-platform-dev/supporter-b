'use client';

import { useState } from 'react';
import { Button } from '@/components/primitives/Button';
import { Label } from '@/components/primitives/Label';
import {
  BizLookupField,
  type BizLookupResult,
} from '@/components/rfp/BizLookupField';
import { isValidBizNo } from '@/lib/validation/biz-no';

// 체크섬만으로 사업자번호 유효성을 검사한다. NTS API 호출 없음.
const bizNoCheck = async (bizNo: string) => {
  if (!isValidBizNo(bizNo)) {
    return { valid: false as const, error: '유효하지 않은 사업자등록번호입니다.' };
  }
  return { valid: true as const };
};

type BizProfilePayload = {
  bizNo: string;
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
      bizProfile: { bizNo: bizProfile.bizNo },
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
        onLookup={bizNoCheck}
        onResult={(profile) => {
          setBizProfile(profile);
        }}
        onReset={() => {
          setBizProfile(null);
        }}
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
