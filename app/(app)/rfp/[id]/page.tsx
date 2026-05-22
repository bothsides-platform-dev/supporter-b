import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { PageEnter } from '@/components/primitives/PageEnter';
import { BackButton } from '@/components/primitives/BackButton';
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

  const { workspaceId, id: userId, name, email } = session.user;

  return (
    <>
      <div className="px-8 pt-6">
        <BackButton />
      </div>
      <Suspense
        fallback={
          <PageEnter className="px-8 py-8 space-y-10">
            <RfpDetailContent.Skeleton />
          </PageEnter>
        }
      >
        <RfpDetailLoader
          id={id}
          wsId={workspaceId}
          userId={userId}
          userName={name ?? email ?? '구매사 담당자'}
        />
      </Suspense>
    </>
  );
}

async function RfpDetailLoader({
  id,
  wsId,
  userId,
  userName,
}: {
  id: string;
  wsId: string;
  userId: string;
  userName: string;
}) {
  const data = await loadBuyerRfpDetail({
    code: id,
    workspaceId: wsId,
    userId,
    userName,
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
