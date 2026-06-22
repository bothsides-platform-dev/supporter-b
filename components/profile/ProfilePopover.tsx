'use client';

import type { ReactNode } from 'react';
import { Popover } from '@base-ui/react/popover';
import { cn } from '@/lib/utils';

/**
 * 신원 카드 팝오버 셸 — 아바타(트리거) 클릭 시 떠오르는 카드 컨테이너의 공통 골격
 * (Popover.Root/Trigger/Portal/Positioner/Popup + 동일 스타일). 사람 카드(UserProfileCard)와
 * 회사 카드(CounterpartyProfileCard)가 공유해 모양·동작을 일치시킨다. 트리거의 stopPropagation
 * 은 목록 행/링크 안에 박힌 아바타를 클릭해도 행 네비게이션이 같이 발화하지 않게 한다.
 */
export function ProfilePopover({
  triggerAriaLabel,
  triggerClassName,
  trigger,
  children,
  onOpenChange,
}: {
  triggerAriaLabel: string;
  triggerClassName?: string;
  trigger: ReactNode;
  children: ReactNode;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <Popover.Root onOpenChange={onOpenChange}>
      <Popover.Trigger
        type="button"
        aria-label={triggerAriaLabel}
        className={triggerClassName}
        onClick={(e) => e.stopPropagation()}
      >
        {trigger}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6} className="isolate z-50">
          <Popover.Popup
            className={cn(
              'z-50 w-[240px] origin-(--transform-origin) rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] p-3 shadow-md',
              'data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
            )}
          >
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
