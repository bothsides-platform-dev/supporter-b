'use client';

import Link from 'next/link';
import { RfpListTable } from '@/components/rfp/RfpListTable';
import { BoardFilterBar } from '@/components/board/BoardFilterBar';
import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/primitives/Button';
import { EmptyState } from '@/components/primitives/EmptyState';
import { FileTextIcon, PlusIcon } from '@/components/icons';
import { filterRfps } from '@/lib/server/board/filterRfps';
import { MERCHANT_TIER_LABELS } from '@/lib/types/bid';
import { useNavSearchParams } from '@/lib/nav/demo-nav-context';
import { demoRfps, demoRfpProgress } from '../demo-app-fixtures';

// 실제 /rfp 와 같은 상태·등급 옵션(app/(app)/rfp/page.tsx 와 동일한 파생).
const STATUS_OPTIONS = [
  { value: 'active', label: '진행중' },
  { value: 'closed', label: '마감' },
];
const GRADE_OPTIONS = Object.entries(MERCHANT_TIER_LABELS).map(([value, label]) => ({ value, label }));

// 데모 견적 요청 목록 — 실제 /rfp 페이지와 같은 chrome(PageHeader + BoardFilterBar +
// RfpListTable)을 쓴다. 필터 파라미터는 실제 페이지가 서버에서 쓰는 filterRfps 를
// 그대로 통과시켜(같은 단일 출처) 데모에서도 같은 결과를 낸다.
// 행 클릭은 onOpenRfp로 인플레이스 이동.
export function RfpListPageHost({ onOpenRfp }: { onOpenRfp: (code: string) => void }) {
  const search = useNavSearchParams();
  const now = new Date();
  const rfps = filterRfps(demoRfps, {
    status: search.get('status') ?? undefined,
    deadline: search.get('deadline') ?? undefined,
    grade: search.get('grade') ?? undefined,
  }, now);

  const newRfpAction = (
    <Link href="/rfp-create">
      <Button size="sm" icon={<PlusIcon />}>
        견적 요청하기
      </Button>
    </Link>
  );

  return (
    <div className="relative flex flex-col">
      <PageHeader title="견적 요청" count={rfps.length} action={newRfpAction} />
      <div className="border-b border-[var(--md-sys-color-outline-variant)] px-6 py-2">
        <BoardFilterBar statusOptions={STATUS_OPTIONS} gradeOptions={GRADE_OPTIONS} />
      </div>
      {rfps.length === 0 ? (
        <div className="space-y-4 px-6 pt-4">
          <EmptyState
            icon={<FileTextIcon size={32} />}
            title="아직 보낸 견적 요청이 없어요."
            description="필터를 바꾸거나 첫 견적 요청을 보내보세요."
          />
        </div>
      ) : (
        <RfpListTable
          rfps={rfps}
          onOpenRfp={onOpenRfp}
          progressByRfpId={demoRfpProgress}
          now={now.toISOString()}
        />
      )}
    </div>
  );
}
