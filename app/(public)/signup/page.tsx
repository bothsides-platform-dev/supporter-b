'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { RoleChooser } from '@/components/auth/RoleChooser';
import { useSignupDraftStore } from '@/lib/stores/signup-draft';
import { writeSignupDraft } from '@/lib/auth/signup-storage';
import { safeInternalNext } from '@/lib/auth/safe-next';

function SignupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setWorkspaceType } = useSignupDraftStore();

  const handleSelect = (role: 'buyer' | 'pg') => {
    const safeNext = safeInternalNext(searchParams.get('next')) ?? undefined;
    setWorkspaceType(role);
    writeSignupDraft({ workspaceType: role, next: safeNext });
    router.push(role === 'buyer' ? '/signup/buyer' : '/signup/pg');
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-[26px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
          어떤 계정으로 시작할까요?
        </h2>
        <p className="mt-2 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          역할에 맞는 가입 경로를 선택해요.
        </p>
      </div>

      <RoleChooser onSelect={handleSelect} />

      <div className="text-center">
        <Link
          href="/login"
          className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
        >
          이미 계정이 있어요? 로그인 →
        </Link>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <p className="font-mono text-[12px] tracking-[0.16em] uppercase text-center">
          LOADING…
        </p>
      }
    >
      <SignupContent />
    </Suspense>
  );
}
