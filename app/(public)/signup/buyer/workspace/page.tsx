'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
// 페이로드 타입은 폼이 단일 출처다 — 여기 사본을 두면 taxType optional 같은
// 계약 변경이 한쪽에만 반영돼 조용히 어긋난다(실제로 그랬다).
import {
  BuyerWorkspaceForm,
  type BizProfilePayload,
} from '@/components/auth/BuyerWorkspaceForm';
import { SignupStepper } from '@/components/auth/SignupStepper';
import { readSignupDraft, writeSignupDraft } from '@/lib/auth/signup-storage';

export default function BuyerWorkspacePage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // 단순 sessionStorage 읽기는 동기 — 렌더 중 guard 가능.
  const draft = readSignupDraft();
  const ready = !!draft.email && !!draft.password;

  // 직전 단계 미완료 시 step 1 으로 리디렉션 (effect 에서 side-effect 만).
  useEffect(() => {
    if (!ready) router.replace('/signup/buyer');
  }, [ready, router]);

  if (!ready) return null;

  // 3단계에서 뒤로 오면 이름과 조회 결과를 되살린다 — 다시 조회하지 않아도 된다.
  // taxType 이 없으면 국세청 장애로 미검증 통과한 결과다(BizLookupField 와 같은 판정).
  const initialValue =
    draft.wsName && draft.bizProfile
      ? {
          wsName: draft.wsName,
          bizProfile: { ...draft.bizProfile, verified: !!draft.bizProfile.taxType },
        }
      : undefined;

  const handleSubmit = async (payload: { wsName: string; bizProfile: BizProfilePayload }) => {
    setSubmitting(true);
    setError('');

    writeSignupDraft({
      ...readSignupDraft(),
      wsName: payload.wsName,
      bizProfile: payload.bizProfile,
    });

    setSubmitting(false);
    router.push('/signup/buyer/profile');
  };

  return (
    <div className="space-y-6">
      <SignupStepper current={2} total={3} />

      <div>
        <h2 className="text-[26px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
          구매사 워크스페이스를 만듭니다
        </h2>
        <p className="mt-2 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          회사명과 사업자 정보를 입력해주세요.
        </p>
      </div>

      <BuyerWorkspaceForm
        onSubmit={handleSubmit}
        submitting={submitting}
        error={error}
        initialValue={initialValue}
      />
    </div>
  );
}
