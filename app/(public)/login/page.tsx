'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/primitives/Button';
import { Checkbox } from '@/components/primitives/Checkbox';
import { PasswordField } from '@/components/auth/PasswordField';
import { loginAction } from '@/lib/server/actions/auth';
import {
  LOCK_THRESHOLD,
  getState,
  recordFailure,
  resetAttempts,
} from '@/lib/auth/login-attempts';

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const mm = Math.floor(total / 60)
    .toString()
    .padStart(2, '0');
  const ss = (total % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/home';
  const [email, setEmail] = useState(
    () => searchParams.get('email') ?? '',
  );
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // React 19 strict purity rules forbid Date.now() in the render body, so the
  // clock is pulled from state and bumped on each tick / after every failure.
  // The lazy initializer keeps SSR/CSR boundary clean.
  const [now, setNow] = useState<number>(() => Date.now());

  const attempts = getState(email, undefined, now);
  const locked =
    attempts.lockedUntilTs !== null && now < attempts.lockedUntilTs;
  const remainingMs = locked
    ? (attempts.lockedUntilTs as number) - now
    : 0;

  useEffect(() => {
    if (!locked) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [locked]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (locked) return;
    setError('');
    setSubmitting(true);
    const r = await loginAction({ email, password });
    setSubmitting(false);
    if (!r.ok) {
      const after = recordFailure(email);
      setNow(Date.now());
      if (after.lockedUntilTs !== null) {
        setError(
          `로그인 시도가 ${LOCK_THRESHOLD}회 초과되어 15분간 잠겼습니다.`,
        );
      } else {
        setError('이메일 또는 비밀번호가 일치하지 않습니다.');
      }
      return;
    }
    resetAttempts(email);
    // Auth.js v5 sets the cookie inside the server action's signIn() call;
    // a router.push is enough to land on the protected route.
    router.push(next);
    router.refresh();
  }

  const submitDisabled = submitting || !email || !password || locked;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-[26px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
          로그인
        </h2>
      </div>

      <form className="space-y-6" onSubmit={handleSubmit}>
        <div className="space-y-1">
          <label
            htmlFor="email"
            className="font-mono text-[11px] tracking-[0.14em] uppercase text-[var(--md-sys-color-on-surface-variant)]"
          >
            이메일
          </label>
          <input
            id="email"
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="block w-full bg-transparent border-0 border-b border-[var(--md-sys-color-outline)] py-2 text-[14px] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] focus:outline-none focus:border-[var(--md-sys-color-on-surface)] transition-colors"
            placeholder="your@email.com"
          />
        </div>

        <PasswordField
          label="비밀번호"
          name="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />

        <label
          htmlFor="rememberMe"
          className="flex items-center gap-2 cursor-pointer"
        >
          <Checkbox
            id="rememberMe"
            checked={rememberMe}
            onCheckedChange={setRememberMe}
          />
          <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
            로그인 유지
          </span>
        </label>

        {locked && (
          <div
            role="alert"
            data-testid="login-lock"
            className="border border-[var(--md-sys-color-error)] rounded-[8px] p-3 space-y-1"
          >
            <p className="text-[12px] text-[var(--md-sys-color-error)]">
              로그인이 잠겼습니다. 잠시 후 다시 시도해주세요.
            </p>
            <p className="font-mono tabular-nums text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
              남은 시간 {formatRemaining(remainingMs)}
            </p>
          </div>
        )}

        {error && !locked && (
          <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--md-sys-color-error)]">
            {error}
          </p>
        )}

        <Button
          type="submit"
          fullWidth
          size="lg"
          disabled={submitDisabled}
        >
          {submitting ? 'LOADING…' : '로그인'}
        </Button>
      </form>

      <div className="flex items-center justify-between">
        <Link
          href="/password/forgot"
          className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
        >
          비밀번호를 잊으셨나요?
        </Link>
        <Link
          href="/signup"
          className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
        >
          회원가입 →
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <p className="font-mono text-[12px] tracking-[0.16em] uppercase text-center">
          LOADING…
        </p>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
