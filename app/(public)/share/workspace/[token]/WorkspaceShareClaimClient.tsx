'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { claimWorkspaceShareTokenAction } from '@/lib/server/actions/workspace/claimWorkspaceShareTokenAction';
import { switchWorkspaceAction } from '@/lib/server/actions/workspace/switchWorkspaceAction';

const ERROR_LABELS: Record<string, string> = {
  SHARE_INVALID: '유효하지 않거나 만료된 초대 링크입니다.',
  UNAUTHENTICATED: '로그인이 필요합니다.',
};

// 공용 초대 링크 합류 (인증 후). 멤버십 생성 뒤 활성 워크스페이스를 합류한 ws로
// 전환한다 — RSC는 JWT 쿠키를 못 세팅하므로 전환은 클라이언트에서. 그렇지 않으면
// 새 멤버십이 재로그인 전까지 inert 상태가 된다(WorkspaceInviteAuthedClient 동일).
export function WorkspaceShareClaimClient({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await claimWorkspaceShareTokenAction(token);
      if (cancelled) return;
      if (r.ok) {
        await switchWorkspaceAction(r.workspaceId);
        if (cancelled) return;
        router.refresh();
        router.replace('/home');
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
          초대 링크 진입 실패
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
        워크스페이스에 합류하는 중입니다.
      </p>
    </div>
  );
}
