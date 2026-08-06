'use client';

import { useEffect, useState } from 'react';
import { acceptWorkspaceInviteAction } from '@/lib/server/actions/workspace/acceptWorkspaceInviteAction';
import { switchWorkspaceAction } from '@/lib/server/actions/workspace/switchWorkspaceAction';

const ERROR_LABELS: Record<string, string> = {
  INVITE_INVALID: '유효하지 않은 초대 링크예요.',
  INVITE_EXPIRED: '초대 링크가 만료됐거나 이미 사용됐어요.',
  INVITE_EMAIL_MISMATCH: '초대된 이메일과 로그인 계정이 달라요.',
  UNAUTHENTICATED: '로그인이 필요해요.',
  ALREADY_MEMBER: '이미 워크스페이스 멤버예요.',
};

// Authenticated workspace-invite accept. Runs client-side (not in the RSC) so
// that after the membership is created we can switch the active workspace into
// the joined ws via the JWT — an RSC cannot set cookies. Without this the new
// membership would be inert until re-login (the bug this fixes).
export function WorkspaceInviteAuthedClient({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await acceptWorkspaceInviteAction(token);
      if (cancelled) return;
      if (r.ok) {
        const sr = await switchWorkspaceAction(r.workspaceId);
        if (cancelled) return;
        // Hard navigation (host-correct redirectTo) — revalidatePath + router.refresh()
        // causes Next.js 16 hang (#86055), and an absolute URL crosses subdomains.
        window.location.assign(sr.ok ? sr.redirectTo : '/home');
      } else {
        setError(r.error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (error) {
    return (
      <div className="py-12 max-w-[420px] mx-auto text-center space-y-3">
        <p className="md-label-small text-[var(--md-sys-color-error)]">
          초대 처리 실패
        </p>
        <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          {ERROR_LABELS[error] ?? error}
        </p>
      </div>
    );
  }

  return (
    <div className="py-8 text-center">
      <p className="md-label-medium text-[var(--md-sys-color-on-surface-variant)]">
        불러오는 중이에요…
      </p>
      <p className="mt-2 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
        워크스페이스에 합류하는 중입니다.
      </p>
    </div>
  );
}
