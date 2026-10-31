'use client';
import { InboxPageContent } from '@/components/inbox/InboxPageContent';
import { RequestPreview } from '@/components/inbox/RequestPreview';
import { queryInbox, parseInboxParams } from '@/lib/rfp/inbox-query';
import { useNavSearchParams } from '@/lib/nav/demo-nav-context';
import { demoPgInboxRows, demoPgDealData } from './pg-demo-fixtures';

export function PgInboxPageHost({
  onOpenRfp,
}: {
  onOpenRfp: (rfpId: string, tab?: 'write') => void;
}) {
  const search = useNavSearchParams();
  const params = parseInboxParams(Object.fromEntries(search));
  const result = queryInbox(demoPgInboxRows, params);
  const selected = demoPgInboxRows.find((row) => row.rfpId === params.selected);
  const preview = selected
    ? {
        ...demoPgDealData,
        rfp: {
          ...demoPgDealData.rfp,
          code: selected.rfpId,
          title: selected.rfpTitle,
          deadline: selected.rfpDeadline,
          requiredPaymentMethods: selected.requiredPaymentMethods ?? [],
        },
        buyer: {
          ...demoPgDealData.buyer,
          name: selected.buyerName ?? '데모 구매사',
        },
        industryName: selected.industryName,
      }
    : null;
  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <InboxPageContent
        {...result}
        totalCount={demoPgInboxRows.length}
        selected={params.selected}
        onOpenRfp={onOpenRfp}
        industries={[
          ...new Set(demoPgInboxRows.flatMap((r) => (r.industryName ? [r.industryName] : []))),
        ]}
        preview={
          <RequestPreview
            data={preview}
            demoState={selected}
            onOpenWork={() => onOpenRfp(params.selected!, 'write')}
          />
        }
      />
    </div>
  );
}
