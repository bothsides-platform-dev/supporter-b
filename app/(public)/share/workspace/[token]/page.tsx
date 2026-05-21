// 워크스페이스 공용 초대 링크 landing.
//
// - 비인증: `/login?next=/share/workspace/<token>` 로 redirect — 로그인/가입 후
//   같은 URL로 돌아온다(Auth.js v5 next 파라미터). 토큰에서 이메일을 추정할 수
//   없으므로 prefill 분기 없음. 신규 유저가 가입하면 본인 워크스페이스가 새로
//   생기고 active로 잡히지만, 복귀 후 claim이 대상 ws에 멤버로 추가한 뒤
//   클라이언트에서 active를 그쪽으로 전환한다(기존 `/invite/workspace/[token]`
//   가입 경로와 동일한 v0 동작).
// - 인증: WorkspaceShareClaimClient가 claim → 활성 ws 전환 → /home.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { WorkspaceShareClaimClient } from './WorkspaceShareClaimClient';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ token: string }> };

export default async function ShareWorkspacePage({ params }: Props) {
  const { token } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/login?next=${encodeURIComponent(`/share/workspace/${token}`)}`);
  }

  return <WorkspaceShareClaimClient token={token} />;
}
