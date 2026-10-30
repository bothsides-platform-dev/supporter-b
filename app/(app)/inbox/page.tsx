import { Suspense } from 'react';
import { InboxPageContent } from '@/components/inbox/InboxPageContent';
import { requirePgPage } from '@/lib/auth/page-guards';
import { loadPgInboxData, pgInboxDataToRows } from '@/lib/server/board/pgInbox';
import { InboxListSkeleton } from '@/components/inbox/InboxList';
import { PageHeader } from '@/components/shell/PageHeader';
import {
  filterInboxRows,
  type BoardFilterParams,
} from '@/lib/server/board/filterRfps';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams: Promise<BoardFilterParams>;
};

export default async function InboxPage({ searchParams }: Props) {
  const session = await requirePgPage('/inbox');

  const sp = await searchParams;

  return (
    <div className="flex flex-col h-full">
      <Suspense
        fallback={
          <>
            <PageHeader title="받은 견적 요청" />
            <InboxListSkeleton />
          </>
        }
      >
        <InboxListPageLoader wsId={session.user.workspaceId} params={sp} />
      </Suspense>
    </div>
  );
}

async function InboxListPageLoader({
  wsId,
  params,
}: {
  wsId: string;
  params: BoardFilterParams;
}) {
  const now = new Date();
  // 3-쿼리 조립의 단일 출처 — 목록 행과 대시보드가 같은 분류 데이터를 소비한다.
  const pgData=await loadPgInboxData(wsId);
  const allRows=pgInboxDataToRows(pgData).sort((a, b) => Date.parse(a.rfpDeadline) - Date.parse(b.rfpDeadline));
  const rows = filterInboxRows(allRows, params, now);

  return <InboxPageContent rows={rows} totalCount={allRows.length} />;
}
