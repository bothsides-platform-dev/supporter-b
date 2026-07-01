'use client';

import { RfpListTable } from '@/components/rfp/RfpListTable';
import { demoRfps } from '../demo-app-fixtures';
import { DemoCue } from '../DemoCue';

// 데모 견적 요청 목록 — 실제 RfpListTable을 fixture로. 행 클릭은 onOpenRfp로 인플레이스 이동.
export function RfpListPageHost({
  onOpenRfp,
  showCue = false,
}: {
  onOpenRfp: (code: string) => void;
  showCue?: boolean;
}) {
  return (
    <div className="relative flex flex-col gap-4 px-6 py-6">
      <DemoCue show={showCue} label="견적 요청을 눌러 받은 견적을 확인해요" />
      <h1 className="text-[18px] font-medium tracking-[-0.01em] text-[var(--md-sys-color-on-surface)]">
        견적 요청
      </h1>
      <RfpListTable rfps={demoRfps} onOpenRfp={onOpenRfp} />
    </div>
  );
}
