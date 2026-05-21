import { redirect } from 'next/navigation';
import { PageEnter } from '@/components/primitives/PageEnter';
import { RfpDetailContent } from '@/components/rfp/RfpDetailContent';
import { auth } from '@/auth';
import { loadBuyerRfpDetail } from '@/lib/server/rfp-detail-loader';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export default async function RfpDetailPage({ params }: Props) {
  const { id } = await params;
  const session = await auth();
  if (
    !session?.user?.id ||
    session.user.workspaceType !== 'buyer' ||
    !session.user.workspaceId
  ) {
    redirect(`/login?next=/rfp/${id}`);
  }

  // URL 파라미터 id 는 사람용 code(P-YYMM-NNNN). loader 가 내부 조회·소유 가드.
  const data = await loadBuyerRfpDetail({
    code: id,
    workspaceId: session.user.workspaceId,
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? '구매사 담당자',
  });
  if (!data) {
    return (
      <div className="px-8 py-8">
        <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)]">
          RFP를 찾을 수 없습니다.
        </p>
      </div>
    );
  }

  return (
    <PageEnter className="px-8 py-8 space-y-10">
      <RfpDetailContent data={data} />
    </PageEnter>
  );
}
