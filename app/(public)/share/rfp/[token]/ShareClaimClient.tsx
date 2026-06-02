'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { claimShareTokenAction } from '@/lib/server/actions/invitation';

const ERROR_LABELS: Record<string, string> = {
  SHARE_INVALID: '유효하지 않은 공유 링크예요.',
  SHARE_EXPIRED: '이 공유 링크는 마감 또는 종료됐어요.',
  SHARE_BUYER_NOT_ALLOWED:
    '구매사 계정으로는 공유 링크를 사용할 수 없어요. PG 계정으로 로그인해요.',
  EMAIL_DOMAIN_MISMATCH:
    '이 RFP에 초대된 도메인이 아니에요. 구매사 담당자에게 문의해요.',
  UNAUTHENTICATED: '로그인이 필요해요.',
};

export function ShareClaimClient({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await claimShareTokenAction(token);
      if (cancelled) return;
      if (r.ok) {
        router.replace(`/inbox/${r.rfpId}`);
      } else {
        setError(r.error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  if (error) {
    return (
      <div className="py-12 max-w-[420px] mx-auto text-center space-y-3">
        <p className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--md-sys-color-error)]">
          공유 링크 진입 실패
        </p>
        <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          {ERROR_LABELS[error] ?? error}
        </p>
      </div>
    );
  }

  return (
    <div className="py-8 text-center">
      <p className="font-mono text-[12px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
        LOADING…
      </p>
      <p className="mt-2 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
        RFP 진입을 확인하는 중입니다.
      </p>
    </div>
  );
}
