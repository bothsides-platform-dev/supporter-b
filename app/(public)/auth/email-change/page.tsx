'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckSvg } from '@/components/auth/EnvelopeSvg';
import Link from 'next/link';
import { emailChangeConfirmAction } from '@/lib/server/actions/auth';

type State = 'loading' | 'success' | 'failed';

function EmailChangeContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [state, setState] = useState<State>('loading');
  const ranOnce = useRef(false);

  useEffect(() => {
    if (!token) return;
    // Atomic-consume guard for Strict-mode double-render.
    if (ranOnce.current) return;
    ranOnce.current = true;

    let cancelled = false;
    (async () => {
      const r = await emailChangeConfirmAction({ rawToken: token });
      if (cancelled) return;
      setState(r.ok ? 'success' : 'failed');
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!token) {
    return <p className="text-[13px] text-[var(--md-sys-color-error)] text-center">잘못된 링크입니다.</p>;
  }
  if (state === 'loading') {
    return <p className="md-label-medium text-[var(--md-sys-color-on-surface-variant)] text-center">불러오는 중이에요…</p>;
  }
  if (state === 'failed') {
    return (
      <div className="space-y-4 text-center">
        <p className="text-[13px] text-[var(--md-sys-color-error)]">링크가 만료되었거나 이미 사용되었습니다.</p>
        <Link href="/login" className="md-label-small text-[var(--md-sys-color-on-surface)]">
          로그인 →
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-6 text-center">
      <div className="flex justify-center text-[var(--md-sys-color-tertiary)]"><CheckSvg size={56} /></div>
      <p className="text-[14px] text-[var(--md-sys-color-on-surface)]">이메일이 변경되었습니다.</p>
      <Link href="/login" className="block md-label-small text-[var(--md-sys-color-on-surface)]">로그인 →</Link>
    </div>
  );
}

export default function EmailChangePage() {
  return (
    <Suspense fallback={<p className="md-label-medium text-center">불러오는 중이에요…</p>}>
      <EmailChangeContent />
    </Suspense>
  );
}
