'use client';

import { useClosePeek } from '@/lib/hooks/useClosePeek';

/** 피크 패널 뒤 목록 영역을 덮는 딤 스크림 — 클릭 시 패널을 닫는다. */
export function PeekBackdrop() {
  const close = useClosePeek();
  return (
    <div
      onClick={close}
      aria-hidden
      className="absolute inset-0 z-10 bg-black/10 animate-in fade-in duration-150"
    />
  );
}
