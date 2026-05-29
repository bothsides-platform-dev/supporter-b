import React from 'react';
import { PeekBackdrop } from '@/components/ui/peek-backdrop';

interface SplitViewProps {
  list: React.ReactNode;
  panel?: React.ReactNode;
}

export function SplitView({ list, panel }: SplitViewProps) {
  if (!panel) return <>{list}</>;
  // 패널은 목록 위에 오버레이로 슬라이드 인 — 목록은 full-width 그대로 유지(reflow 없음).
  // 좌측 240px 거터(left-60)에는 딤 스크림이 보이고, 클릭 시 패널이 닫힌다.
  return (
    <div className="relative flex flex-1 overflow-hidden">
      {list}
      <PeekBackdrop />
      <aside className="absolute inset-y-0 right-0 left-60 z-20 flex flex-col overflow-y-auto border-l border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] shadow-lg animate-in slide-in-from-right-[100%] duration-300 ease-out">
        {panel}
      </aside>
    </div>
  );
}
