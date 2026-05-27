'use client';

import { useEffect, useState } from 'react';
import { acceptWorkspaceInviteAction } from '@/lib/server/actions/workspace/acceptWorkspaceInviteAction';
import { switchWorkspaceAction } from '@/lib/server/actions/workspace/switchWorkspaceAction';

const ERROR_LABELS: Record<string, string> = {
  INVITE_INVALID: '존재하지 않는 초대 링크입니다.',
  INVITE_EXPIRED: '만료되었거나 이미 사용된 초대 링크입니다.',
  INVITE_EMAIL_MISMATCH: '초대된 이메일과 로그인 계정이 다릅니다.',
  UNAUTHENTICATED: '로그인이 필요합니다.',
  ALREADY_MEMBER: '이미 워크스페이스 멤버입니다.',
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
        await switchWorkspaceAction(r.workspaceId);
        if (cancelled) return;
        // Hard navigation: revalidatePath + router.refresh() causes Next.js 16 hang (#86055)
        window.location.replace('/home');
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
        <p className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--md-sys-color-error)]">
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
      <p className="font-mono text-[12px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
        LOADING…
      </p>
      <p className="mt-2 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
        워크스페이스에 합류하는 중입니다.
      </p>
    </div>
  );
}
