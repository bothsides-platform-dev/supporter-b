'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { readSignupDraft, writeSignupDraft } from '@/lib/auth/signup-storage';

type Props = {
  token: string;
  inviteEmail?: string;
};

/**
 * RFP 초대 미인증 진입 처리.
 *
 * inviteEmail 이 있는 경우: 해당 이메일의 PG 사용자가 이미 계정을 보유하고 있음
 * (RFP 초대는 기존 워크스페이스로 발송). 로그인 페이지로 이메일 프리필하여
 * 이동 — 로그인 후 /invite/rfp/[token] 으로 돌아온다.
 *
 * inviteEmail 이 없는 경우: 토큰이 유효하지 않거나, 워크스페이스 admin 이메일을
 * 찾을 수 없음. 수동 이메일 입력을 위해 /signup/pg 로 이동.
 */
export function InviteUnauthClient({ token, inviteEmail }: Props) {
  const router = useRouter();

  useEffect(() => {
    // inviteToken 을 draft 에 보존 (가입 경로에서 claim 에 사용)
    const draft = readSignupDraft();
    writeSignupDraft({ ...draft, workspaceType: 'pg', inviteToken: token });

    if (inviteEmail) {
      // 기존 PG 사용자 → 로그인 프리필, next= 로 초대 페이지 복귀
      const next = encodeURIComponent(`/invite/rfp/${token}`);
      router.replace(`/login?email=${encodeURIComponent(inviteEmail)}&next=${next}`);
    } else {
      // 토큰 무효/만료 또는 이메일 불명 → 수동 입력
      router.replace('/signup/pg');
    }
  }, [token, inviteEmail, router]);

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
