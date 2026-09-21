'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { PhoneVerificationField } from '@/components/auth/PhoneVerificationField';
import { updateMyPhoneAction } from '@/lib/server/actions/user/updateMyPhoneAction';
import { toast } from '@/lib/toast';
import { formatPhoneInput } from '@/lib/utils/phone';
import { errorLabel } from '@/lib/utils/error-label';
import { Button } from '@/components/primitives/Button';
import { Chip } from '@/components/primitives/Chip';
import { settingsDetailLabelClass, settingsDetailRowClass } from './settings-layout';

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
      <div className={settingsDetailRowClass}>
        <span className={settingsDetailLabelClass}>휴대폰</span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {currentPhone ? (
              <span className="md-numeric text-[14px] text-[var(--md-sys-color-on-surface)]">
                {formatPhoneInput(currentPhone)}
              </span>
            ) : (
              <Chip label="인증 필요" color="warning" />
            )}
            <Button
              type="button"
              variant={currentPhone ? 'outlined' : 'filled'}
              size="sm"
              onClick={() => setEditing(true)}
            >
              {currentPhone ? '변경' : '인증하기'}
            </Button>
          </div>
          {!currentPhone && (
            <p className="mt-2 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
              계약서 서명에 본인인증이 필요해요. 인증해 두면 계약서를 보내고 받을 수 있어요.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 py-3">
      {/* 이 화면이 받는 번호는 서명 본인인증용이다 — 010 만 저장할 수 있으므로
          SMS 이전에 막는다. 없으면 011 번호가 실제 SMS 와 OTP 왕복을 다 거친 뒤
          마지막 저장에서 PHONE_NOT_MOBILE_010 으로 튕긴다. */}
      <PhoneVerificationField onVerified={handleVerified} requireMobile010 />
      <div className="flex items-center justify-end">
        <Button
          type="button"
          variant="text"
          size="sm"
          onClick={() => setEditing(false)}
          disabled={saving}
        >
          취소
        </Button>
      </div>
    </div>
  );
}
