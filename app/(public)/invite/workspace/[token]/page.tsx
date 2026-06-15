// Workspace invite landing page.
//
// 비인증(신규 유저): draft에 { wsInviteToken, email, inviteWorkspaceName } 기록 후
//   /signup/pg(step 1)로 보낸다. step 1에서 email prefill+lock + 워크스페이스명 안내.
//   EMAIL_TAKEN → /login?next=... (기존 유저 로그인 후 authed path로 합류).
//   토큰 유효하지 않으면 오류 메시지 표시.
//
// 인증(기존 유저): acceptWorkspaceInviteAction 서버 사이드 호출.
//   - ok → /home redirect
//   - error → 인라인 오류 메시지
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { getWorkspaceRepo } from '@/lib/server/repositories/factory';
import { hashToken } from '@/lib/server/token';
import { accountExistsForEmail } from '@/lib/server/invite/workspaceInviteLanding';
import { WorkspaceInviteAuthedClient } from './WorkspaceInviteAuthedClient';
import { WorkspaceInviteEmailMismatch } from './WorkspaceInviteEmailMismatch';
import { WorkspaceInviteUnauthClient } from './WorkspaceInviteUnauthClient';

type Props = { params: Promise<{ token: string }> };

const ERROR_LABELS: Record<string, string> = {
  INVITE_INVALID: '존재하지 않는 초대 링크입니다.',
  INVITE_EXPIRED: '만료되었거나 이미 사용된 초대 링크입니다.',
};

export default async function WorkspaceInvitePage({ params }: Props) {
  const { token } = await params;
  const tokenHash = hashToken(token);

  // Resolve invitation + workspace name and session check in parallel (independent).
  const [row, session] = await Promise.all([
    (await getWorkspaceRepo()).findInvitationByTokenHash(tokenHash),
    auth(),
  ]);
  const isAuthed = !!session?.user?.id;

  // ── Authenticated path ────────────────────────────────────────────────
  // Client-driven: accept → switch active ws into the joined workspace → /home.
  // An RSC can't set the JWT cookie, so the switch must happen client-side or
  // the new membership stays inert until re-login.
  if (isAuthed) {
    // Show the same expired/invalid error to authed users — don't mislead them
    // into thinking a logout+retry will fix an invalid token.
    if (!row || row.status !== 'pending' || row.expiresAt < new Date()) {
      return (
        <div className="py-12 max-w-[420px] mx-auto text-center space-y-3">
          <p className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--md-sys-color-error)]">
            초대 링크 오류
          </p>
          <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
            {!row ? ERROR_LABELS['INVITE_INVALID'] : ERROR_LABELS['INVITE_EXPIRED']}
          </p>
        </div>
      );
    }

    const inviteEmail = row.invitedEmail;
    const currentEmail = session?.user?.email;
    const mismatch =
      currentEmail &&
      inviteEmail.trim().toLowerCase() !== currentEmail.trim().toLowerCase();

    if (mismatch) {
      return <WorkspaceInviteEmailMismatch inviteEmail={inviteEmail} token={token} />;
    }

    return <WorkspaceInviteAuthedClient token={token} />;
  }

  // ── Unauthenticated path ──────────────────────────────────────────────
  if (!row || row.status !== 'pending' || row.expiresAt < new Date()) {
    return (
      <div className="py-12 max-w-[420px] mx-auto text-center space-y-3">
        <p className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--md-sys-color-error)]">
          초대 링크 오류
        </p>
        <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          {!row
            ? ERROR_LABELS['INVITE_INVALID']
            : ERROR_LABELS['INVITE_EXPIRED']}
        </p>
      </div>
    );
  }

  // 이미 계정이 있는 이메일(미인증 포함)이면 가입 폼 대신 로그인으로 보낸다(#9).
  // 로그인 후 같은 초대 링크로 복귀 → authed path 에서 수락. 미인증 기존계정이
  // 가입 동선 끝에서 EMAIL_TAKEN 막다른 길에 빠지는 것을 landing 에서 차단.
  if (await accountExistsForEmail(row.invitedEmail)) {
    redirect(`/login?next=${encodeURIComponent(`/invite/workspace/${token}`)}`);
  }

  // Valid invite, no existing account — hand off to client component so the token
  // can be stored in sessionStorage before routing to the (type-neutral) invite
  // signup flow (server redirect loses the token). workspaceName 은 step 1 의
  // "○○ 워크스페이스에 초대받았습니다" 안내용.
  return (
    <WorkspaceInviteUnauthClient
      token={token}
      inviteEmail={row.invitedEmail}
      workspaceName={row.workspaceName}
    />
  );
}
