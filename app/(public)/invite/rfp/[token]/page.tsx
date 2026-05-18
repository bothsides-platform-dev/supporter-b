// RFP invite landing.
//
// - 비인증: InviteUnauthClient 로 위임 — 가입/로그인 후 재방문.
// - 인증: InviteAuthedClient → claimInviteTokenAction → /inbox/<rfpId> redirect.
//
// RSC + client 컴포넌트 분리. 인증된 경우 클라이언트가 액션을 호출해야
// error 상태(만료/사용/멤버십 불일치)를 렌더할 수 있다.
import { auth } from '@/auth';
import { InviteUnauthClient } from './InviteUnauthClient';
import { InviteAuthedClient } from './InviteAuthedClient';

type Props = { params: Promise<{ token: string }> };

export default async function InviteRfpPage({ params }: Props) {
  const { token } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    return (
      <InviteUnauthClient
        token={token}
        inviteEmail={undefined}
      />
    );
  }

  return <InviteAuthedClient token={token} />;
}
