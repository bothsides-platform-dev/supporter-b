'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { readSignupDraft, writeSignupDraft } from '@/lib/auth/signup-storage';

type Props = {
  token: string;
  inviteEmail: string;
  workspaceName: string;
};

// Unauthenticated workspace-invite landing.
//
// 새 가입 경로: draft에 { wsInviteToken, email, inviteWorkspaceName } 기록 후
// /signup/pg(step 1)로 보낸다. signupEmailAction(인증 메일 발송)은 verify 진입 시
// 호출 — 여기서 미리 호출할 이유가 없음.
//
// EMAIL_TAKEN(기존 유저) 처리: step 1의 checkEmailAvailableAction이 담당.
// 기존 유저는 /login?next=<invite-url>로 유도해 로그인 후 authed path로 합류.
export function WorkspaceInviteUnauthClient({ token, inviteEmail, workspaceName }: Props) {
  const router = useRouter();

  useEffect(() => {
    const draft = readSignupDraft();
    writeSignupDraft({
      ...draft,
      workspaceType: 'pg',
      wsInviteToken: token,
      email: inviteEmail,
      inviteWorkspaceName: workspaceName,
    });

    // step 1로 보낸다. step 1이 wsInviteToken 존재를 감지해 email prefill + skip 라우팅.
    router.replace('/signup/pg');
  }, [token, inviteEmail, workspaceName, router]);

  return (
    <div className="py-8 text-center">
      <p className="font-mono text-[12px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
        LOADING…
      </p>
      <p className="mt-2 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
        초대 링크를 확인하는 중입니다.
      </p>
    </div>
  );
}
