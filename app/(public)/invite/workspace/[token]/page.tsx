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
import { eq } from 'drizzle-orm';

import { auth } from '@/auth';
import { db as prodDb } from '@/lib/db/client';
import { workspaceInvitations, workspaces } from '@/lib/db/schema';
import { hashToken } from '@/lib/server/token';
import { WorkspaceInviteAuthedClient } from './WorkspaceInviteAuthedClient';
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
  const [[row], session] = await Promise.all([
    prodDb
      .select({
        invitedEmail: workspaceInvitations.invitedEmail,
        status: workspaceInvitations.status,
        expiresAt: workspaceInvitations.expiresAt,
        workspaceName: workspaces.name,
        workspaceId: workspaceInvitations.workspaceId,
      })
      .from(workspaceInvitations)
      .innerJoin(workspaces, eq(workspaces.id, workspaceInvitations.workspaceId))
      .where(eq(workspaceInvitations.tokenHash, tokenHash))
      .limit(1),
    auth(),
  ]);
  const isAuthed = !!session?.user?.id;

  // ── Authenticated path ────────────────────────────────────────────────
  // Client-driven: accept → switch active ws into the joined workspace → /home.
  // An RSC can't set the JWT cookie, so the switch must happen client-side or
  // the new membership stays inert until re-login.
  if (isAuthed) {
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

  // Valid invite — hand off to client component so the token can be stored
  // in sessionStorage before routing to signup (server redirect loses the token).
  // workspaceName is passed so step 1 can show "○○ 워크스페이스에 초대받았습니다".
  return (
    <WorkspaceInviteUnauthClient
      token={token}
      inviteEmail={row.invitedEmail}
      workspaceName={row.workspaceName}
    />
  );
}
