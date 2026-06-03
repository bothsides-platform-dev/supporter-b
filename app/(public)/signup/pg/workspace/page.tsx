'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/primitives/Button';
import { Label } from '@/components/primitives/Label';
import { SignupStepper } from '@/components/auth/SignupStepper';
import {
  BizLookupField,
  type BizLookupResult,
} from '@/components/rfp/BizLookupField';
import { lookupBizNoAction } from '@/lib/server/actions/rfp';
import { readSignupDraft, writeSignupDraft } from '@/lib/auth/signup-storage';

// 구매사(BuyerWorkspaceForm)와 동일한 국세청(NTS) 자동 조회 어댑터.
// lookupBizNoAction → BizLookupField 가 기대하는 { valid, taxType?, status? } 형태로 변환.
const ntsLookup = async (bizNo: string) => {
  const r = await lookupBizNoAction(bizNo);
  if (!r.ok || !r.valid) return { valid: false as const };
  return {
    valid: true as const,
    taxType: r.taxType!,
    status: r.status!,
  };
};

export default function PgWorkspacePage() {
  const router = useRouter();

  const [wsName, setWsName] = useState('');
  const [bizProfile, setBizProfile] = useState<BizLookupResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const draft = readSignupDraft();
  const ready = !!draft.email && !!draft.password;
  const isInvited = !!draft.wsInviteToken;

  useEffect(() => {
    if (!ready) { router.replace('/signup/pg'); return; }
    // 초대 경로는 워크스페이스 단계를 건너뜀
    if (isInvited) { router.replace('/signup/pg/profile'); return; }
  }, [ready, isInvited, router]);

  if (!ready || isInvited) return null;

  // 국세청 사업자 조회 완료 + 워크스페이스 이름 모두 있어야 제출 가능.
  const canSubmit = wsName.trim() !== '' && bizProfile !== null && !submitting;

  const handleSubmit = () => {
    if (!canSubmit || !bizProfile) return;
    setSubmitting(true);

    writeSignupDraft({
      ...readSignupDraft(),
      wsName: wsName.trim(),
      // pg_profiles.biz_no 는 digits 10자리로 저장 — 하이픈 제거.
      bizNo: bizProfile.bizNo.replace(/-/g, ''),
    });

    router.push('/signup/pg/profile');
  };

  return (
    <div className="space-y-6">
      <SignupStepper current={2} total={3} />

      <div>
        <h2 className="text-[26px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
          워크스페이스를 만듭니다
        </h2>
        <p className="mt-2 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          PG 워크스페이스 이름과 사업자등록번호를 입력해주세요.
        </p>
      </div>

      <div className="space-y-8">
        <div className="space-y-1">
          <Label size="md" muted={false}>워크스페이스 이름 *</Label>
          <input
            type="text"
            value={wsName}
            onChange={(e) => setWsName(e.target.value)}
            placeholder="예: 서포터 B 페이 영업팀"
            disabled={submitting}
            className="block w-full bg-transparent border-0 border-b border-[var(--md-sys-color-outline)] py-2 text-[14px] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] focus:outline-none focus:border-[var(--md-sys-color-on-surface)] transition-colors"
          />
        </div>

        <BizLookupField
          onLookup={ntsLookup}
          onResult={(profile) => setBizProfile(profile)}
          onReset={() => setBizProfile(null)}
        />

        <Button
          type="button"
          fullWidth
          size="lg"
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          {submitting ? 'LOADING…' : '다음'}
        </Button>
      </div>
    </div>
  );
}
