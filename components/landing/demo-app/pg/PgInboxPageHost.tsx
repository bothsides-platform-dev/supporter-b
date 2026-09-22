'use client';

import { InboxList } from '@/components/inbox/InboxList';
import { BoardFilterBar } from '@/components/board/BoardFilterBar';
import { PageHeader } from '@/components/shell/PageHeader';
import { EmptyState } from '@/components/primitives/EmptyState';
import { InboxIcon } from '@/components/icons';
import { filterInboxRows } from '@/lib/server/board/filterRfps';
import { MERCHANT_TIER_LABELS } from '@/lib/types/bid';
import { useNavSearchParams } from '@/lib/nav/demo-nav-context';
import { demoPgInboxRows } from './pg-demo-fixtures';

// 실제 /inbox 와 같은 상태·등급 옵션(app/(app)/inbox/page.tsx 와 동일한 파생).
const STATUS_OPTIONS = [
  { value: 'new', label: '신규' },
  { value: 'submitted', label: '견적 보냄' },
  { value: 'closed', label: '마감' },
];
const GRADE_OPTIONS = Object.entries(MERCHANT_TIER_LABELS).map(([value, label]) => ({ value, label }));

// 데모 받은 요청 — 실제 /inbox 페이지와 같은 chrome(PageHeader + BoardFilterBar +
// InboxList)을 쓰고, 필터는 실제 페이지가 서버에서 쓰는 filterInboxRows 를 그대로
// 통과시킨다. 행 클릭은 onOpenRfp로 인플레이스 이동(router.push 미사용).
export function PgInboxPageHost({ onOpenRfp }: { onOpenRfp: (rfpId: string) => void }) {
  const search = useNavSearchParams();
  const rows = filterInboxRows(demoPgInboxRows, {
    status: search.get('status') ?? undefined,
    deadline: search.get('deadline') ?? undefined,
    grade: search.get('grade') ?? undefined,
  }, new Date());

  return (
    <div className="relative flex flex-col">
      <PageHeader title="받은 견적 요청" count={rows.length} />
      <div className="border-b border-[var(--md-sys-color-outline-variant)] px-6 py-2">
        <BoardFilterBar statusOptions={STATUS_OPTIONS} gradeOptions={GRADE_OPTIONS} />
      </div>
      {rows.length === 0 ? (
        <div className="space-y-4 px-6 pt-4">
          <EmptyState
            icon={<InboxIcon size={32} />}
            title="아직 받은 견적 요청이 없어요."
            description="필터를 바꾸면 견적 요청을 볼 수 있어요. 구매사가 초대한 견적 요청이 여기에 표시돼요."
          />
        </div>
      ) : (
        <InboxList rows={rows} onOpenRfp={onOpenRfp} />
      )}
    </div>
  );
}
