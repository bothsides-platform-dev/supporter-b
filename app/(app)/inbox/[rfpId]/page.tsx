// PG RFP 상세 (RSC). 데이터·소유 가드·markOpened 부수효과는 loadPgRfpDetail 에 위임.
// auth/redirect 가드만 page shell 책임.
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { loadPgRfpDetail } from '@/lib/server/rfp-detail-loader';
import { PgRfpDetailContent } from '@/components/inbox/PgRfpDetailContent';

type Props = { params: Promise<{ rfpId: string }> };

export const dynamic = 'force-dynamic';

export default async function InboxDetailPage({ params }: Props) {
  // URL 파라미터는 사람용 code(P-YYMM-NNNN).
  const { rfpId: rfpCode } = await params;

  const session = await auth();
  if (!session?.user?.id || !session.user.workspaceId) {
    redirect(`/login?next=/inbox/${rfpCode}`);
  }

  const data = await loadPgRfpDetail({
    code: rfpCode,
    workspaceId: session.user.workspaceId,
  });
  if (!data) notFound();

  return (
    <div className="px-8 py-8">
      <PgRfpDetailContent data={data} mode="page" />
    </div>
  );
}
