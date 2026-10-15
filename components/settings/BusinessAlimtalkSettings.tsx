'use client';
import { useState } from 'react';
import Link from 'next/link';
import { updateBusinessAlimtalkAction } from '@/lib/server/actions/user/updateBusinessAlimtalkAction';

export function BusinessAlimtalkSettings({
  enabled,
  maskedPhone,
}: {
  enabled: boolean;
  maskedPhone: string | null;
}) {
  const [checked, setChecked] = useState(enabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  async function change() {
    if (saving) return;
    setSaving(true);
    setError(false);
    setSaved(false);
    try {
      const result = await updateBusinessAlimtalkAction({ enabled: !checked });
      if (!result.ok) {
        setError(true);
        return;
      }
      setChecked(!checked);
      setSaved(true);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="space-y-3 py-3">
      <label className="flex items-center gap-3 text-[16px]">
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={saving}
          onChange={() => void change()}
          aria-describedby="alimtalk-description"
          className="relative h-5 w-9 shrink-0 appearance-none rounded-[6px] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] before:absolute before:left-0.5 before:top-0.5 before:size-3.5 before:rounded-[4px] before:bg-[var(--md-sys-color-on-surface-variant)] before:transition-transform checked:bg-[var(--md-sys-color-primary)] checked:before:translate-x-4 checked:before:bg-[var(--md-sys-color-on-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-primary)] disabled:opacity-50 motion-reduce:before:transition-none"
        />
        업무 알림톡 받기
      </label>
      <p
        id="alimtalk-description"
        className="text-[14px] text-[var(--md-sys-color-on-surface-variant)]"
      >
        견적과 계약의 주요 소식을 카카오톡으로 받아요. 알림톡을 받지 못하면
        문자로 보내요. 이 설정을 끄면 대체 문자도 보내지 않아요.
      </p>
      <p className="text-[14px]">
        {maskedPhone ? (
          <>
            수신번호 <span className="md-numeric">{maskedPhone}</span>
          </>
        ) : (
          '휴대폰을 인증하면 알림톡을 받을 수 있어요.'
        )}
      </p>
      <Link
        href="/settings/profile"
        className="text-[14px] text-[var(--md-sys-color-primary)] underline"
      >
        휴대폰 인증·변경
      </Link>
      <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
        이메일·앱 알림과 휴대폰 인증번호는 이 설정과 관계없이 받아요.
      </p>
      <p role="status" className="text-[13px]">
        {saving ? '저장 중…' : saved ? '알림 설정을 저장했어요.' : ''}
      </p>
      {error && (
        <p
          role="alert"
          className="text-[14px] text-[var(--md-sys-color-error)]"
        >
          설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.
        </p>
      )}
    </section>
  );
}
