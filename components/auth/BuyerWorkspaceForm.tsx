'use client';

import { useState } from 'react';
import { Button } from '@/components/primitives/Button';
import { Label } from '@/components/primitives/Label';
import {
  BizLookupField,
  type BizLookupResult,
} from '@/components/rfp/BizLookupField';
import { ntsLookup } from '@/components/rfp/nts-lookup';
import { underlineInputClass } from '@/components/forms/inputs';

export type BizProfilePayload = {
  bizNo: string;
  // 국세청 장애로 검증을 건너뛴 경우 비어 있다 — 서버가 재판정하므로 여기서
  // 채워 보내는 값은 어차피 쓰이지 않는다(resolveBizProfileForWrite 참조).
  taxType?: 'general' | 'simple' | 'exempt';
  status?: 'active' | 'suspended' | 'closed';
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
          className={underlineInputClass}
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
          className="md-label-small text-[var(--md-sys-color-error)]"
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
