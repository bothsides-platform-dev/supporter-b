'use client';

/**
 * DealRoomActionRail — 딜룸 좌측 세로 액션 레일(아이콘 + 라벨 버튼).
 * 항목은 side별 body 가 구성한다(구매사: 선정·재요청·… / PG: 작성·제출·…).
 * 각 액션은 다이얼로그를 열거나 가운데 탭을 전환하는 등 onSelect 로 동작한다.
 */
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type RailAction = {
  id: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  /** 위험 작업(취소·철회) — hover 시 error 색. */
  danger?: boolean;
  /** 주요 작업(선정·작성) — primary 색. */
  primary?: boolean;
  disabled?: boolean;
};

export function DealRoomActionRail({ actions }: { actions: RailAction[] }) {
  return (
    <nav
      aria-label="견적 작업"
      className="flex w-[76px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] py-2"
    >
      {actions.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={a.onSelect}
          disabled={a.disabled}
          className={cn(
            'mx-1 flex flex-col items-center gap-1.5 rounded-[var(--md-sys-shape-small)] px-1 py-2.5 text-[11px] tracking-[-0.01em] transition-colors',
            'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)] hover:text-[var(--md-sys-color-on-surface)]',
            'disabled:pointer-events-none disabled:opacity-40',
            a.primary &&
              'text-[var(--md-sys-color-primary)] hover:text-[var(--md-sys-color-primary)]',
            a.danger &&
              'hover:bg-[var(--md-sys-color-error-container)] hover:text-[var(--md-sys-color-error)]',
            '[&_svg]:size-[19px]',
          )}
        >
          {a.icon}
          <span>{a.label}</span>
        </button>
      ))}
    </nav>
  );
}
