'use client';

/**
 * DealRoomActionRail — 딜룸 좌측 액션 레일(아이콘 + 라벨 버튼).
 * 항목은 side별 body 가 구성한다(구매사: 선정·재요청·… / PG: 작성·제출·…).
 * 각 액션은 다이얼로그를 열거나 가운데 탭을 전환하는 등 onSelect 로 동작한다.
 * lg 이상은 좌측 세로 76px 레일, lg 미만은 본문 위 가로 아이콘 바(가로 스크롤).
 */
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { TONE_COLOR_VAR, type ChipColor } from '@/components/primitives/Chip';

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
  /** 상태 표식 — 아이콘 우상단 점(전자서명 진행 상태 등). */
  dot?: ChipColor;
  /**
   * `dot`이 전달하는 상태를 색 외 텍스트로도 전달 — `dot`이 유일한 상태 표식인
   * 탭(요청 조건·첨부·PG 관리 등 SigningSummaryStrip이 없는 화면)에서 스크린리더
   * 사용자가 아무 신호도 못 받는 문제를 막는다. sr-only 로 렌더되어 버튼 접근성
   * 이름에 "계약 서명 진행 중"처럼 실린다.
   */
  dotLabel?: string;
};

export function DealRoomActionRail({ actions }: { actions: RailAction[] }) {
  return (
    <nav
      aria-label="견적 작업"
      className="flex w-[76px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] py-2 max-lg:w-full max-lg:flex-row max-lg:overflow-x-auto max-lg:overflow-y-hidden max-lg:border-r-0 max-lg:border-b max-lg:px-2 max-lg:py-1.5"
    >
      {actions.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={a.onSelect}
          disabled={a.disabled}
          className={cn(
            'relative mx-1 flex flex-col items-center gap-1.5 rounded-[var(--md-sys-shape-small)] px-1 py-2.5 text-[11px] tracking-[-0.01em] transition-colors max-lg:mx-0 max-lg:shrink-0 max-lg:px-3',
            'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)] hover:text-[var(--md-sys-color-on-surface)]',
            'disabled:pointer-events-none disabled:opacity-40',
            a.primary &&
              'text-[var(--md-sys-color-primary)] hover:text-[var(--md-sys-color-primary)]',
            a.danger &&
              'hover:bg-[var(--md-sys-color-error-container)] hover:text-[var(--md-sys-color-error)]',
            '[&_svg]:size-[19px]',
          )}
        >
          {a.dot && (
            <span
              data-testid="rail-dot"
              aria-hidden
              className="absolute top-[7px] right-[16px] size-[7px] rounded-full ring-2 ring-[var(--md-sys-color-surface)] max-lg:right-[8px]"
              style={{ background: TONE_COLOR_VAR[a.dot] }}
            />
          )}
          {a.icon}
          <span>{a.label}</span>
          {a.dotLabel && (
            <>
              {' '}
              <span className="sr-only">{a.dotLabel}</span>
            </>
          )}
        </button>
      ))}
    </nav>
  );
}
