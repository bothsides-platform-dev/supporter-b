// RFP-scoped 공유 링크 landing.
//
// - 비인증: `/login?next=/share/rfp/<token>` 로 redirect — 로그인/가입 후 자동으로
//   같은 URL로 돌아온다(Auth.js v5 next 파라미터). invite landing(`/invite/rfp/[token]`)
//   과 달리 토큰에서 이메일을 추정할 수 없으므로 prefill 분기 없음.
// - 인증: ShareClaimClient가 claimShareTokenAction을 호출해 도메인 검증 + PG ws
//   합류를 처리한 뒤 /inbox/<rfpId>로 이동.
//
// 토큰 모델은 `/invite/rfp/[token]`(per-PG 단건)과 별개 — 여기는 RFP-scoped
// 영구 share token. 정책/검증 로직 모두 다르므로 라우트도 분리.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { ShareClaimClient } from './ShareClaimClient';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ token: string }> };

export default async function ShareRfpPage({ params }: Props) {
  const { token } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/login?next=${encodeURIComponent(`/share/rfp/${token}`)}`);
  }

  return <ShareClaimClient token={token} />;
}
