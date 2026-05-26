'use client';

import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { BuyerWorkspaceForm } from '@/components/auth/BuyerWorkspaceForm';
import { signupCompleteAction } from '@/lib/server/actions/auth';
import {
  clearSignupDraft,
  readSignupDraft,
} from '@/lib/auth/signup-storage';
import type { MerchantGrade } from '@/lib/types/biz-profile';

type BizProfilePayload = {
  bizNo: string;
  taxType: 'general' | 'simple' | 'exempt';
  status: 'active' | 'suspended' | 'closed';
  grade: MerchantGrade;
  gradeSource: 'user_confirmed';
};

export default function BuyerWorkspacePage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (payload: { wsName: string; bizProfile?: BizProfilePayload }) => {
    const d = readSignupDraft();
    if (!d.email || !d.password || !d.name || !d.phone || !d.phoneVerificationId) {
      setError('세션이 만료되었습니다. 처음부터 다시 시도해주세요.');
      return;
    }
    setSubmitting(true);
    setError('');

    const r = await signupCompleteAction({
      email: d.email,
      name: d.name,
      password: d.password,
      phone: d.phone,
      phoneVerificationId: d.phoneVerificationId,
      wsKind: 'buyer',
      wsName: payload.wsName,
      ...(payload.bizProfile ? { bizProfile: payload.bizProfile } : {}),
    });

    if (!r.ok) {
      setSubmitting(false);
      setError(`가입을 완료하지 못했습니다. (${r.error})`);
      return;
    }

    const signInResult = await signIn('credentials', {
      email: r.email,
      password: r.password,
      redirect: false,
    });

    clearSignupDraft();

    if (signInResult && signInResult.error) {
      setSubmitting(false);
      setError('로그인에 실패했습니다. 로그인 페이지에서 다시 시도해주세요.');
      router.push('/login');
      return;
    }

    const rfpNext = localStorage.getItem('supporter-b-rfp-next');
    if (rfpNext) {
      localStorage.removeItem('supporter-b-rfp-next');
      router.push(rfpNext);
    } else {
      router.push(r.redirectTo);
    }
  };

  return (
    <div className="space-y-8">
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
      />
    </div>
  );
}
