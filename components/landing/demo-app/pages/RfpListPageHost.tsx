'use client';

import { RfpListTable } from '@/components/rfp/RfpListTable';
import { demoRfps } from '../demo-app-fixtures';

// 데모 견적 요청 목록 — 실제 RfpListTable을 fixture로. 행 클릭은 onOpenRfp로 인플레이스 이동.
export function RfpListPageHost({ onOpenRfp }: { onOpenRfp: (code: string) => void }) {
  return (
    <div className="relative flex flex-col gap-4 px-6 py-6">
      <h1 className="text-[18px] font-medium tracking-[-0.01em] text-[var(--md-sys-color-on-surface)]">
        견적 요청
      </h1>
      <RfpListTable rfps={demoRfps} onOpenRfp={onOpenRfp} />
    </div>
  );
}
