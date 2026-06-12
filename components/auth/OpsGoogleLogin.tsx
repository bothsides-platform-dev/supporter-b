'use client';

import { signIn } from 'next-auth/react';
import { Button } from '@/components/primitives/Button';

/**
 * Operator (master) Google sign-in — rendered only on the hidden `/login/ops`
 * route. Access is gated server-side by the MASTER_ACCOUNT_EMAILS allowlist
 * (default-deny in the `signIn` callback); this button just starts the flow.
 */
export function OpsGoogleLogin() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[length:var(--md-typescale-title-large-size)] font-semibold tracking-[-0.01em] text-[var(--md-sys-color-on-surface)]">
          운영자 로그인
        </h1>
        <p className="mt-1 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          허용된 Google 계정만 접근할 수 있어요.
        </p>
      </div>
      <Button
        variant="outlined"
        size="lg"
        onClick={() => signIn('google', { callbackUrl: '/home' })}
      >
        Google로 계속하기
      </Button>
    </div>
  );
}
