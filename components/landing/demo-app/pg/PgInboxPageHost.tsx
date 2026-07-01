'use client';

import { InboxList } from '@/components/inbox/InboxList';
import { DemoCue } from '../DemoCue';
import { demoPgInboxRows } from './pg-demo-fixtures';

// 데모 받은 요청 — 실제 InboxList를 fixture로. 행 클릭은 onOpenRfp로 인플레이스 이동(router.push 미사용).
export function PgInboxPageHost({
  onOpenRfp,
  showCue = false,
}: {
  onOpenRfp: (rfpId: string) => void;
  showCue?: boolean;
}) {
  return (
    <div className="relative flex flex-col gap-4 px-6 py-6">
      <DemoCue show={showCue} label="받은 견적 요청을 눌러 상세를 확인해요" />
      <h1 className="text-[18px] font-medium tracking-[-0.01em] text-[var(--md-sys-color-on-surface)]">
        받은 견적 요청
      </h1>
      <InboxList rows={demoPgInboxRows} onOpenRfp={onOpenRfp} />
    </div>
  );
}
