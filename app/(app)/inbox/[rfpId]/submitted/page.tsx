// 제출 완료 화면 (RSC + canAccess 가드).
//
// canAccess 게이트는 초대된 워크스페이스 멤버 모두 통과. 본인 ws의 submitted
// bid 를 hydrate (동료가 제출한 제안도 같이 보임).
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import {
  getBidRepo,
  getInvitationRepo,
  getRfpRepo,
} from '@/lib/server/repositories/factory';
import { GRADE_LABELS } from '@/lib/types/biz-profile';
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/lib/types/bid';
import { formatDate, formatPct, formatKRW } from '@/lib/format';

type Props = { params: Promise<{ rfpId: string }> };

export const dynamic = 'force-dynamic';

export default async function InboxSubmittedPage({ params }: Props) {
  const { rfpId: rfpCode } = await params; // URL param = 사람용 code

  const session = await auth();
  if (!session?.user?.id || !session.user.workspaceId) {
    redirect(`/login?next=/inbox/${rfpCode}/submitted`);
  }

  const rfpRepo = await getRfpRepo();
  const rfp = await rfpRepo.findByCode(rfpCode);
  if (!rfp) notFound();

  const invRepo = await getInvitationRepo();
  const ok = await invRepo.canAccess(rfp.id, session.user.workspaceId);
  if (!ok) notFound();

  const bidRepo = await getBidRepo();
  const allBids = await bidRepo.findByRfp(rfp.id);
  const bid = allBids.find(
    (b) => b.pgWsId === session.user!.workspaceId && b.status === 'submitted',
  );

  if (!bid) {
    return (
      <div className="px-8 py-8">
        <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)]">
          제출된 제안이 없습니다.
        </p>
        <Link
          href={`/inbox/${rfpCode}`}
          className="mt-4 block font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
        >
          ← 제안 작성으로
        </Link>
      </div>
    );
  }

  const grade = rfp.bizProfile?.grade;

  return (
    <div className="px-8 py-8 space-y-10">
      {/* Status */}
      <div>
        <p className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--md-sys-color-tertiary)] mb-3">
          ✓ 제출 완료
        </p>
        <h1 className="text-[26px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
          제안이 제출되었습니다
        </h1>
        <p className="mt-2 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          구매사가 마감일까지 비교·검토 후 결과를 알립니다.
        </p>
        {bid.submittedAt && (
          <p className="mt-1 font-mono text-[11px] tabular-nums text-[var(--md-sys-color-on-surface-variant)]">
            제출 {new Date(bid.submittedAt).toLocaleString('ko-KR')}
          </p>
        )}
      </div>

      {/* RFP summary */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-[var(--md-sys-color-on-surface-variant)]">제안 요청</span>
          <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
        </div>
        <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
          {[
            ['RFP', rfp.code],
            ['제목', rfp.title],
            ['등급', grade ? GRADE_LABELS[grade] : '—'],
            ['마감', formatDate(rfp.deadline)],
          ].map(([label, value]) => (
            <div key={label} className="py-2.5 flex items-baseline justify-between">
              <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">{label}</span>
              <span className="text-[13px] text-[var(--md-sys-color-on-surface)]">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bid summary */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-[var(--md-sys-color-on-surface-variant)]">제출 제안</span>
          <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
        </div>
        <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
          {[
            ['정산 주기', bid.settleCycle],
            ['정산한도', formatKRW(bid.settleLimit)],
            ['월 보증보험', formatKRW(bid.guaranteeInsurance)],
            ...Object.entries(bid.paymentFees).map(
              ([m, fee]) =>
                [PAYMENT_METHOD_LABELS[m as PaymentMethod], formatPct(fee as number)] as [
                  string,
                  string,
                ],
            ),
            ...Object.entries(bid.customFees).map(([id, fee]) => {
              const label =
                rfp.customPaymentMethods.find((c) => c.id === id)?.label ?? id;
              return [label, formatPct(fee)] as [string, string];
            }),
          ].map(([label, value]) => (
            <div key={label} className="py-2.5 flex items-baseline justify-between">
              <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">{label}</span>
              <span className="font-mono text-[13px] tabular-nums text-[var(--md-sys-color-on-surface)]">{value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <Link
          href="/inbox"
          className="block font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
        >
          ← 수신함으로
        </Link>
      </div>
    </div>
  );
}
