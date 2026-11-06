import { Suspense } from 'react';
import { InboxPageContent } from '@/components/inbox/InboxPageContent';
import { requirePgPage } from '@/lib/auth/page-guards';
import { loadPgInboxData, pgInboxDataToRows } from '@/lib/server/board/pgInbox';
import { InboxListSkeleton } from '@/components/inbox/InboxList';
import { PageHeader } from '@/components/shell/PageHeader';
import { queryInbox, parseInboxParams, type InboxParams } from '@/lib/rfp/inbox-query';
import { loadPgRfpDetail } from '@/lib/server/rfp-detail-loader';
import { RequestPreview } from '@/components/inbox/RequestPreview';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function InboxPage({ searchParams }: Props) {
  const session = await requirePgPage('/inbox');

  const sp = parseInboxParams(await searchParams);

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
        <InboxListPageLoader wsId={session.user.workspaceId} userId={session.user.id} params={sp} />
      </Suspense>
    </div>
  );
}

async function InboxListPageLoader({
  wsId,
  userId,
  params,
}: {
  wsId: string;
  userId: string;
  params: InboxParams;
}) {
  const data = await loadPgInboxData(wsId, userId);
  const allRows = pgInboxDataToRows(data);
  const result = queryInbox(allRows, params);
  let detail = null;
  let failed = false;
  if (params.selected) {
    try {
      detail = await loadPgRfpDetail({
        code: params.selected,
        workspaceId: wsId,
        userId,
      });
    } catch {
      failed = true;
    }
  }
  return (
    <InboxPageContent
      {...result}
      totalCount={allRows.length}
      selected={params.selected}
      industries={[
        ...new Set(allRows.flatMap((r) => (r.industryName ? [r.industryName] : []))),
      ].sort()}
      preview={
        params.selected ? (
          <RequestPreview key={params.selected} data={detail} failed={failed} />
        ) : undefined
      }
    />
  );
}
