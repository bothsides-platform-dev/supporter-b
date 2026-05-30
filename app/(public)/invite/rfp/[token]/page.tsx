// RFP invite landing.
//
// - 비인증: InviteUnauthClient 로 위임 — 가입/로그인 후 재방문.
// - 인증: InviteAuthedClient → claimInviteTokenAction → /inbox/<rfpId> redirect.
//
// RSC + client 컴포넌트 분리. 인증된 경우 클라이언트가 액션을 호출해야
// error 상태(만료/사용/멤버십 불일치)를 렌더할 수 있다.
//
// 이메일 프리필 수정: 기존에는 inviteEmail={undefined} 고정으로 수동 입력으로
// 튕겼음. 이제 토큰 해시로 초대 row를 조회 → pgWsId → 워크스페이스 admin 이메일
// 를 가져와서 InviteUnauthClient 에 전달. 해당 이메일은 로그인 폼에 프리필됨.
import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db as prodDb } from '@/lib/db/client';
import { rfpInvitations, workspaceMembers, users } from '@/lib/db/schema';
import { hashToken } from '@/lib/server/token';
import { InviteUnauthClient } from './InviteUnauthClient';
import { InviteAuthedClient } from './InviteAuthedClient';
import { and } from 'drizzle-orm';

type Props = { params: Promise<{ token: string }> };

export default async function InviteRfpPage({ params }: Props) {
  const { token } = await params;
  const session = await auth();

  if (session?.user?.id) {
    return <InviteAuthedClient token={token} />;
  }

  // 토큰 해시로 초대 row 조회 → pgWsId → admin 이메일 프리필
  const tokenHash = hashToken(token);
  const [invite] = await prodDb
    .select({ pgWsId: rfpInvitations.pgWsId })
    .from(rfpInvitations)
    .where(eq(rfpInvitations.tokenHash, tokenHash))
    .limit(1);

  let inviteEmail: string | undefined;
  if (invite?.pgWsId) {
    const [adminUser] = await prodDb
      .select({ email: users.email })
      .from(workspaceMembers)
      .innerJoin(users, eq(workspaceMembers.userId, users.id))
      .where(
        and(
          eq(workspaceMembers.workspaceId, invite.pgWsId),
          eq(workspaceMembers.role, 'admin'),
        ),
      )
      .limit(1);
    inviteEmail = adminUser?.email;
  }

  return (
    <InviteUnauthClient
      token={token}
      inviteEmail={inviteEmail}
    />
  );
}
