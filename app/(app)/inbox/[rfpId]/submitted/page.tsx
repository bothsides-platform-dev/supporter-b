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
import {
  MERCHANT_TIERS,
  MERCHANT_TIER_LABELS,
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
  type TierRates,
} from '@/lib/types/bid';
import { formatDate, formatPct, formatKRW } from '@/lib/format';
import { LocalTime } from '@/components/primitives/LocalTime';
import { SubmittedSummary } from '@/components/inbox/SubmittedSummary';

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
          아직 보낸 견적이 없어요.
        </p>
        <Link
          href={`/inbox/${rfpCode}`}
          className="mt-4 block font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
        >
          ← 견적 작성으로
        </Link>
      </div>
    );
  }

  const grade = rfp.bizProfile?.grade;

  const summaryRows: [string, string][] = [
    ['견적 요청 번호', rfp.code],
    ['제목', rfp.title],
    ['등급', grade ? GRADE_LABELS[grade] : '—'],
    ['마감', formatDate(rfp.deadline)],
    ['정산 주기', bid.settleCycle],
    ['정산한도', formatKRW(bid.settleLimit)],
    ['월 보증보험', formatKRW(bid.guaranteeInsurance)],
    ...Object.entries(bid.paymentFees).flatMap(([m, fee]) => {
      const label = PAYMENT_METHOD_LABELS[m as PaymentMethod];
      if (typeof fee === 'object' && fee !== null) {
        return MERCHANT_TIERS
          .filter((t) => (fee as TierRates)[t] !== undefined)
          .map((t) => [`${label} (${MERCHANT_TIER_LABELS[t]})`, formatPct((fee as TierRates)[t]!)] as [string, string]);
      }
      return [[label, formatPct(fee as number)] as [string, string]];
    }),
    ...Object.entries(bid.customFees).map(([id, fee]) => {
      const label = rfp.customPaymentMethods.find((c) => c.id === id)?.label ?? id;
      return [label, formatPct(fee)] as [string, string];
    }),
  ];

  return (
    <div className="px-8 py-16 max-w-2xl mx-auto">
      {/* 메시지 지배 */}
      <div className="text-center">
        <div className="text-[32px] leading-none text-[var(--md-sys-color-tertiary)]">✓</div>
        <h1 className="mt-3 text-[26px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
          견적을 보냈어요
        </h1>
        <p className="mt-2 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          구매사가 마감일까지 비교·검토 후 결과를 알려드려요.
        </p>
        {bid.submittedAt && (
          <p className="mt-1 font-mono text-[11px] tabular-nums text-[var(--md-sys-color-on-surface-variant)]">
            보낸 시각 <LocalTime iso={bid.submittedAt} />
          </p>
        )}
      </div>

      {/* 다음 행동 1개 (1차) */}
      <div className="mt-8 flex items-center justify-center gap-3">
        <Link
          href="/inbox"
          className="inline-flex items-center rounded-[6px] bg-[var(--md-sys-color-primary)] px-4 py-2 text-[13px] font-medium text-[var(--md-sys-color-on-primary)] hover:opacity-90 transition-opacity"
        >
          수신함으로
        </Link>
      </div>

      {/* 요약은 접힘 */}
      <div className="mt-10">
        <SubmittedSummary rows={summaryRows} />
      </div>
    </div>
  );
}
