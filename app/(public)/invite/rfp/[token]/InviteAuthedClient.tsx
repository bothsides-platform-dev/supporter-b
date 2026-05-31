'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { claimInviteTokenAction } from '@/lib/server/actions/invitation';
import { switchWorkspaceAction } from '@/lib/server/actions/workspace/switchWorkspaceAction';

const ERROR_LABELS: Record<string, string> = {
  INVITE_INVALID: '유효하지 않은 초대 링크예요.',
  INVITE_EXPIRED: '초대 링크가 만료됐어요. 새 링크를 요청해요.',
  INVITE_NOT_MEMBER: '초대된 워크스페이스의 멤버가 아니에요.',
  UNAUTHENTICATED: '로그인이 필요해요.',
};

// 인증된 사용자 — 액션을 호출해 토큰 클레임 후 /inbox/<rfpId>로 이동.
// 에러 시 안내 문구 표시.
export function InviteAuthedClient({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await claimInviteTokenAction(token);
      if (cancelled) return;
      if (r.ok) {
        // Member of the invited PG ws but active elsewhere — switch active into
        // it so the inbox (scoped to the active ws) shows this RFP.
        if (r.switchTo) {
          await switchWorkspaceAction(r.switchTo);
          if (cancelled) return;
        }
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
        초대를 확인하는 중입니다.
      </p>
    </div>
  );
}
