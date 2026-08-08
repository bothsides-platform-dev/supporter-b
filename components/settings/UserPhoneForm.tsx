'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { PhoneVerificationField } from '@/components/auth/PhoneVerificationField';
import { updateMyPhoneAction } from '@/lib/server/actions/user/updateMyPhoneAction';
import { toast } from '@/lib/toast';
import { formatPhoneInput } from '@/lib/utils/phone';
import { errorLabel } from '@/lib/utils/error-label';

type Props = { currentPhone: string | null };

const ERROR_LABELS: Record<string, string> = {
  // 간편인증은 010 만 받는다(실측) — 저장 단계에서 끊고 무엇이 문제인지 말한다.
  PHONE_NOT_MOBILE_010: '간편인증은 010 휴대폰 번호만 지원해요. 010 번호로 인증해 주세요.',
  PHONE_NOT_VERIFIED: '인증이 확인되지 않았어요. 인증을 다시 진행해 주세요.',
  INVALID_PHONE: '휴대폰 번호 형식을 확인해 주세요.',
  UNAUTHENTICATED: '로그인이 필요해요. 다시 로그인해 주세요.',
};

/**
 * 설정 > 프로필 — 본인 휴대폰 인증.
 *
 * 왜 이 화면이 필요한가: 계약서 서명은 양측 담당자의 휴대폰 간편인증을 요구하는데
 * (v0.4.46.0 기본강제), 가입 외에는 번호를 넣을 경로가 없어 번호 없는 계정은
 * 발송이 막힌 뒤 **재가입 말고는 할 수 있는 게 없었다**.
 */
export function UserPhoneForm({ currentPhone }: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();

  async function handleVerified(phone: string, phoneVerificationId: string) {
    if (saving) return;
    setSaving(true);
    const r = await updateMyPhoneAction({ phone, phoneVerificationId });
    setSaving(false);
    if (!r.ok) {
      // 미매핑 코드를 그대로 띄우면 내부 enum 이 노출된다(같은 화면의 다른 폼과
      // 동일한 폴백 정책 — 한쪽만 원문이면 안 된다).
      toast(errorLabel(ERROR_LABELS, r.error, '저장하지 못했어요. 잠시 후 다시 시도해 주세요.'), {
        type: 'error',
      });
      return;
    }
    toast('휴대폰 인증을 완료했어요.');
    setEditing(false);
    startTransition(() => router.refresh());
  }

  if (!editing) {
    return (
      <div className="py-2 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <span className="md-label-small text-[var(--md-sys-color-on-surface-variant)]">
            휴대폰
          </span>
          {!currentPhone && (
            <p className="md-label-small text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
              계약서 서명에 본인인증이 필요해요. 인증해 두면 계약서를 보내고 받을 수 있어요.
            </p>
          )}
        </div>
        <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto">
          <span
            className={
              currentPhone
                ? 'text-[13px] text-[var(--md-sys-color-on-surface)] md-numeric break-all sm:break-keep'
                : 'text-[13px] text-[var(--md-sys-color-on-surface-variant)]'
            }
          >
            {currentPhone ? formatPhoneInput(currentPhone) : '등록 안 됨'}
          </span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="md-label-small text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors shrink-0"
          >
            {currentPhone ? '변경' : '인증하기'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="py-3 space-y-3">
      <PhoneVerificationField onVerified={handleVerified} />
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={saving}
          className="md-label-small text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors disabled:opacity-50"
        >
          취소
        </button>
      </div>
    </div>
  );
}
