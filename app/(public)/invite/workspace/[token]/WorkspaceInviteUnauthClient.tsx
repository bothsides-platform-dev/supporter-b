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
// 초대 가입 화면은 사실상 타입 무관이다(이메일·비밀번호·이름·전화만 받고
// 워크스페이스를 만들지 않음 — finalizeSignup 은 wsInviteToken 분기에서
// workspaceType 을 안 본다). 그래서 모든 초대자를 하나의 invite-aware 가입 흐름
// (/signup/pg, isInvited 시 중립 문구)으로 보낸다. step 1 이 wsInviteToken 을
// 감지해 email prefill + lock + workspace 단계 skip 한다.
//
// EMAIL_TAKEN/기존 계정 처리: 비인증 landing(page.tsx)이 계정 존재 시 로그인으로
// 미리 분기(#9)하고, 끝단은 finalizeSignup 의 /login?next= 복구(#8)가 받친다.
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
