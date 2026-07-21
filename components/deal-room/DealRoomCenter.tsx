'use client';

/**
 * DealRoomCenter — 딜룸 가운데 탭 뷰어. 탭 바(primitives/Tabs) + 활성 탭 본문.
 * 탭 상태는 controlled(부모 = side별 body)라 좌측 액션 레일이 탭을 전환할 수 있다.
 */
import type { ReactNode } from 'react';

import { Tabs } from '@/components/primitives/Tabs';

export type DealRoomTab = { id: string; label: string; content: ReactNode };

type Props = {
  tabs: DealRoomTab[];
  activeId: string;
  onChange: (id: string) => void;
};

export function DealRoomCenter({ tabs, activeId, onChange }: Props) {
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];
  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--md-sys-color-background)]">
      <div className="shrink-0 overflow-x-auto border-b border-[var(--md-sys-color-outline-variant)] px-4">
        <Tabs
          className="w-max min-w-full border-b-0"
          tabs={tabs.map((t) => ({ id: t.id, label: t.label }))}
          active={activeId}
          onChange={onChange}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{active?.content}</div>
    </div>
  );
}
