'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/primitives/Button';
import { PasswordField } from '@/components/auth/PasswordField';
import { useSignupDraftStore } from '@/lib/stores/signup-draft';
import {
  readSignupDraft,
  writeSignupDraft,
} from '@/lib/auth/signup-storage';
import {
  isPasswordValid,
  validatePasswordConfirm,
} from '@/lib/auth/password-validation';

export default function PgProfilePage() {
  const router = useRouter();
  const { setProfile } = useSignupDraftStore();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  const passwordError =
    attemptedSubmit && !password ? '비밀번호를 입력해주세요.' : null;
  const confirmError =
    passwordConfirm.length > 0
      ? validatePasswordConfirm(password, passwordConfirm)
      : attemptedSubmit
        ? '비밀번호 확인을 입력해주세요.'
        : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAttemptedSubmit(true);
    if (!name.trim()) {
      setNameError('이름을 입력해주세요.');
      return;
    }
    setNameError(null);
    if (!password || !isPasswordValid(password)) return;
    if (!passwordConfirm || confirmError) return;
    setProfile(name.trim(), phone.trim() || undefined);
    const currentDraft = readSignupDraft();
    writeSignupDraft({
      ...currentDraft,
      name: name.trim(),
      phone: phone.trim() || undefined,
      password,
    });
    router.push('/signup/pg/workspace');
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-[26px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
          프로필 설정
        </h2>
      </div>
      <form className="space-y-6" onSubmit={handleSubmit}>
        <div className="space-y-1">
          <label
            htmlFor="name"
            className="font-mono text-[11px] tracking-[0.14em] uppercase text-[var(--md-sys-color-on-surface-variant)]"
          >
            이름
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            className="block w-full bg-transparent border-0 border-b border-[var(--md-sys-color-outline)] py-2 text-[14px] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] focus:outline-none focus:border-[var(--md-sys-color-on-surface)] transition-colors"
          />
          {nameError && (
            <p className="text-[11px] text-[var(--md-sys-color-error)]">
              {nameError}
            </p>
          )}
        </div>
        <PasswordField
          label="비밀번호"
          value={password}
          onChange={setPassword}
          showStrength
          error={passwordError ?? undefined}
        />
        <PasswordField
          label="비밀번호 확인"
          name="passwordConfirm"
          value={passwordConfirm}
          onChange={setPasswordConfirm}
          autoComplete="new-password"
          error={confirmError ?? undefined}
        />
        <div className="space-y-1">
          <label
            htmlFor="phone"
            className="font-mono text-[11px] tracking-[0.14em] uppercase text-[var(--md-sys-color-on-surface-variant)]"
          >
            휴대전화 <span className="opacity-50">(선택)</span>
          </label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            placeholder="010-0000-0000"
            className="block w-full bg-transparent border-0 border-b border-[var(--md-sys-color-outline)] py-2 text-[14px] font-mono tabular-nums text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] focus:outline-none focus:border-[var(--md-sys-color-on-surface)] transition-colors"
          />
        </div>
        <Button type="submit" fullWidth size="lg">
          다음
        </Button>
      </form>
    </div>
  );
}
