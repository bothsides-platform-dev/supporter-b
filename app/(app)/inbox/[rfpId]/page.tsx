// PG RFP 상세 (RSC) + 제안 작성 폼.
//
// 가드: canAccess(rfpId, pgWsId) — 초대된 워크스페이스 멤버 모두 통과.
// 미클레임 멤버는 자연 통과(알림 딥링크 정상 동작). false면 notFound() (404).
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import {
  getBidRepo,
  getInvitationRepo,
  getRfpRepo,
} from '@/lib/server/repositories/factory';
import { markInvitationOpenedAction } from '@/lib/server/actions/invitation';
import { RfpBriefPanel } from '@/components/inbox/RfpBriefPanel';
import { BidForm } from '@/components/inbox/BidForm';

type Props = { params: Promise<{ rfpId: string }> };

export const dynamic = 'force-dynamic';

export default async function InboxDetailPage({ params }: Props) {
  const { rfpId } = await params;

  const session = await auth();
  if (!session?.user?.id || !session.user.workspaceId) {
    redirect(`/login?next=/inbox/${rfpId}`);
  }

  const invRepo = await getInvitationRepo();
  // canAccess: 초대된 PG 워크스페이스 멤버 모두 통과. false면 404.
  const ok = await invRepo.canAccess(rfpId, session.user.workspaceId);
  if (!ok) notFound();

  // PG 홈 칸반 '검토중' 컬럼 활성화 — accepted → opened 1회 전이. 이미 opened 이상이면 no-op.
  await markInvitationOpenedAction({ rfpId });

  const rfpRepo = await getRfpRepo();
  const rfp = await rfpRepo.findById(rfpId);
  if (!rfp) notFound();

  // 이미 입찰을 제출했는지 확인 — submitted 상태면 작성 폼 대신 confirm 화면.
  const bidRepo = await getBidRepo();
  const allBids = await bidRepo.findByRfp(rfpId);
  const myBid = allBids.find(
    (b) =>
      b.pgWsId === session.user!.workspaceId && b.status === 'submitted',
  );

  if (myBid) {
    return (
      <div className="px-8 py-8">
        <RfpBriefPanel rfp={rfp} />
        <div className="mt-10 border-t border-[var(--md-sys-color-outline-variant)] pt-8 space-y-4">
          <p className="font-mono text-[11px] tracking-[0.14em] uppercase text-[var(--md-sys-color-tertiary)]">
            ✓ 제안 제출 완료
          </p>
          <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
            제출 시각:{' '}
            {myBid.submittedAt
              ? new Date(myBid.submittedAt).toLocaleString('ko-KR')
              : '—'}
          </p>
          <Link
            href={`/inbox/${rfpId}/submitted`}
            className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
          >
            제출 내역 보기 →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="px-8 py-8 grid grid-cols-[340px_1fr] gap-12">
      {/* Left: RFP brief */}
      <div className="border-r border-[var(--md-sys-color-outline-variant)] pr-10">
        <RfpBriefPanel rfp={rfp} />
      </div>

      {/* Right: Bid form */}
      <div>
        <div className="mb-8">
          <span className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
            정형 제안 입력
          </span>
          <h2 className="text-[22px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)] mt-1">
            제안 작성
          </h2>
        </div>
        <BidForm rfpId={rfpId} grade={rfp.bizProfile?.grade} />
      </div>
    </div>
  );
}
