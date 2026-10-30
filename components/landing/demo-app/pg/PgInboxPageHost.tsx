'use client';

import { InboxPageContent } from '@/components/inbox/InboxPageContent';
import { filterInboxRows } from '@/lib/server/board/filterRfps';
import { useNavSearchParams } from '@/lib/nav/demo-nav-context';
import { demoPgInboxRows } from './pg-demo-fixtures';

// 데모 받은 요청 — 실제 /inbox 페이지와 같은 chrome(PageHeader + BoardFilterBar +
// InboxList)을 쓰고, 필터는 실제 페이지가 서버에서 쓰는 filterInboxRows 를 그대로
// 통과시킨다. 행 클릭은 onOpenRfp로 인플레이스 이동(router.push 미사용).
export function PgInboxPageHost({ onOpenRfp }: { onOpenRfp: (rfpId: string, tab?: 'write') => void }) {
  const search = useNavSearchParams();
  const rows = filterInboxRows(demoPgInboxRows, {
    q: search.get('q') ?? undefined,
    status: search.get('status') ?? undefined,
    deadline: search.get('deadline') ?? undefined,
    grade: search.get('grade') ?? undefined,
  }, new Date());

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <InboxPageContent rows={rows} totalCount={demoPgInboxRows.length} onOpenRfp={onOpenRfp} />
    </div>
  );
}
