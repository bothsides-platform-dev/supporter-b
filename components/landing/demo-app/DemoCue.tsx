'use client';

import { cn } from '@/lib/utils';

// 가이드 투어 코치마크 — 각 데모 페이지가 현재 화면에서 "무엇을 어디에서" 하면 되는지
// 영역 위에 띄우는 안내 칩. 펄스 점으로 시선을 끌고, 방문자가 조작을 시작하면 사라진다
// (show는 셸이 inView && !userInteracted로 구동). pointer-events-none이라 상호작용을 막지 않고,
// prefers-reduced-motion 시 펄스 링은 숨고 점만 남는다.
export function DemoCue({
  show,
  label,
  className,
}: {
  show: boolean;
  label: string;
  className?: string;
}) {
  if (!show) return null;
  return (
    <div
      role="status"
      className={cn(
        'pointer-events-none absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-2',
        'rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-primary)]',
        'bg-[var(--md-sys-color-surface-container-high)] px-3 py-1.5 shadow-md',
        className,
      )}
    >
      <span aria-hidden className="relative inline-flex size-2 shrink-0">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--md-sys-color-primary)] opacity-75 motion-reduce:hidden" />
        <span className="relative inline-flex size-2 rounded-full bg-[var(--md-sys-color-primary)]" />
      </span>
      <span className="text-[13px] text-[var(--md-sys-color-on-surface)]">{label}</span>
    </div>
  );
}
