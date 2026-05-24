'use client';

import { useState } from 'react';
import { Button } from '@/components/primitives/Button';
import { Checkbox } from '@/components/primitives/Checkbox';
import { Label } from '@/components/primitives/Label';
import {
  BizLookupField,
  type BizLookupResult,
} from '@/components/rfp/BizLookupField';
import { GradeConfirmPanel } from '@/components/rfp/GradeConfirmPanel';
import { lookupBizNoAction } from '@/lib/server/actions/rfp';
import type { MerchantGrade } from '@/lib/types/biz-profile';

// Adapter: BizLookupField expects { valid, taxType?, status? }
// lookupBizNoAction returns { ok, valid?, taxType?, status?, error? }
const ntsLookup = async (bizNo: string) => {
  const r = await lookupBizNoAction(bizNo);
  if (!r.ok || !r.valid) return { valid: false as const };
  return {
    valid: true as const,
    taxType: r.taxType!,
    status: r.status!,
  };
};

type BizProfilePayload = {
  bizNo: string;
  taxType: 'general' | 'simple' | 'exempt';
  status: 'active' | 'suspended' | 'closed';
  grade: MerchantGrade;
  gradeSource: 'user_confirmed';
};

type Props = {
  onSubmit: (payload: {
    wsName: string;
    bizProfile?: BizProfilePayload;
  }) => Promise<void>;
  submitting: boolean;
  error?: string;
};

export function BuyerWorkspaceForm({ onSubmit, submitting, error }: Props) {
  const [wsName, setWsName] = useState('');
  const [bizProfile, setBizProfile] = useState<BizLookupResult | null>(null);
  const [grade, setGrade] = useState<MerchantGrade | null>(null);
  const [skipBiz, setSkipBiz] = useState(false);

  const canSubmit =
    wsName.trim() !== '' &&
    !submitting &&
    (skipBiz || bizProfile === null || grade !== null);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const payload: Parameters<typeof onSubmit>[0] = { wsName: wsName.trim() };
    if (!skipBiz && bizProfile && grade) {
      payload.bizProfile = {
        bizNo: bizProfile.bizNo,
        taxType: bizProfile.taxType,
        status: bizProfile.status,
        grade,
        gradeSource: 'user_confirmed',
      };
    }
    await onSubmit(payload);
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

      <label htmlFor="skipBiz" className="flex items-start gap-3 cursor-pointer select-none">
        <Checkbox
          id="skipBiz"
          checked={skipBiz}
          onCheckedChange={(checked) => {
            setSkipBiz(checked);
            if (checked) {
              setBizProfile(null);
              setGrade(null);
            }
          }}
          className="mt-0.5"
        />
        <span className="text-[13px] leading-snug text-[var(--md-sys-color-on-surface)]">
          사업자번호·등급 나중에 입력하기
          <span className="block mt-0.5 font-mono text-[10px] tracking-[0.08em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
            법인 미설립 사전 제안 또는 보완 예정 케이스. 설정에서 추후 추가 가능.
          </span>
        </span>
      </label>

      {!skipBiz && (
        <>
          <BizLookupField
            onLookup={ntsLookup}
            onResult={(profile) => {
              setBizProfile(profile);
              setGrade(null);
            }}
            onReset={() => {
              setBizProfile(null);
              setGrade(null);
            }}
          />

          {bizProfile && (
            <GradeConfirmPanel
              onConfirm={(g) => setGrade(g)}
            />
          )}
        </>
      )}

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
