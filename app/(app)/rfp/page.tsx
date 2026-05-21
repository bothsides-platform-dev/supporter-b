import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Label } from '@/components/primitives/Label';
import { Button } from '@/components/primitives/Button';
import { EmptyState } from '@/components/primitives/EmptyState';
import { FileTextIcon } from '@/components/icons';
import { RfpListTable } from '@/components/rfp/RfpListTable';
import { auth } from '@/auth';
import { getRfpRepo } from '@/lib/server/repositories/factory';

export const dynamic = 'force-dynamic';

export default async function RfpListPage() {
  const session = await auth();
  if (
    !session?.user?.id ||
    session.user.workspaceType !== 'buyer' ||
    !session.user.workspaceId
  ) {
    redirect('/login?next=/rfp');
  }

  const wsId = session.user.workspaceId;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-8 py-5 border-b border-[var(--md-sys-color-outline-variant)]">
        <div>
          <Label size="md" muted={false}>RFP — 제안 요청</Label>
          <h1 className="text-[20px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)] mt-1">
            제안 요청 목록
          </h1>
        </div>
        <Link href="/rfp-new">
          <Button size="sm">+ 신규 제안</Button>
        </Link>
      </div>

      <Suspense fallback={<RfpListTable.Skeleton />}>
        <RfpListTableLoader wsId={wsId} />
      </Suspense>
    </div>
  );
}

async function RfpListTableLoader({ wsId }: { wsId: string }) {
  const rfps = await (await getRfpRepo()).findByBuyerWs(wsId);

  if (rfps.length === 0) {
    return (
      <EmptyState
        icon={<FileTextIcon size={32} />}
        title="발송된 제안 요청이 없습니다."
        description="새로운 제안 요청을 작성해 PG사에 발송하세요."
        action={
          <Link href="/rfp-new">
            <Button size="sm">+ 신규 제안</Button>
          </Link>
        }
      />
    );
  }

  return <RfpListTable rfps={rfps} />;
}
