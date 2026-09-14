'use client';

/**
 * DealRoomActionRail — 딜룸 좌측 액션 레일(아이콘 + 라벨 버튼).
 * 항목은 side별 body 가 구성한다(구매사: 선정·재요청·… / PG: 작성·제출·…).
 * 각 액션은 다이얼로그를 열거나 가운데 탭을 전환하는 등 onSelect 로 동작한다.
 * lg 이상은 좌측 세로 76px 레일, lg 미만은 본문 위 가로 아이콘 바(가로 스크롤).
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
  /** 마감·취소처럼 흐름을 끝내는 작업을 레일 하단의 별도 그룹에 둔다. */
  placement?: 'default' | 'bottom';
};

export function DealRoomActionRail({ actions }: { actions: RailAction[] }) {
  const defaultActions = actions.filter((action) => action.placement !== 'bottom');
  const bottomActions = actions.filter((action) => action.placement === 'bottom');

  const renderAction = (a: RailAction) => (
    <button
      key={a.id}
      type="button"
      onClick={a.onSelect}
      disabled={a.disabled}
      className={cn(
        'mx-1 flex flex-col items-center gap-1.5 rounded-[var(--md-sys-shape-small)] px-1 py-2.5 text-xs tracking-[-0.01em] transition-colors max-lg:mx-0 max-lg:shrink-0 max-lg:px-3',
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
  );

  return (
    <nav
      aria-label="견적 작업"
      className="flex w-[76px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] py-2 max-lg:w-full max-lg:flex-row max-lg:overflow-x-auto max-lg:overflow-y-hidden max-lg:border-r-0 max-lg:border-b max-lg:px-2 max-lg:py-1.5"
    >
      <div className="flex shrink-0 flex-col gap-0.5 max-lg:flex-row">
        {defaultActions.map(renderAction)}
      </div>
      {bottomActions.length > 0 && (
        <div className="mt-auto flex shrink-0 flex-col gap-0.5 border-t border-[var(--md-sys-color-outline-variant)] pt-2 max-lg:mt-0 max-lg:ml-auto max-lg:flex-row max-lg:border-t-0 max-lg:border-l max-lg:pt-0 max-lg:pl-2">
          {bottomActions.map(renderAction)}
        </div>
      )}
    </nav>
  );
}
