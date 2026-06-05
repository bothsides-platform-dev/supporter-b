'use client';

import { Popover } from '@base-ui/react/popover';

import { InfoIcon } from '@/components/icons';
import { getGlossaryEntry } from '@/lib/glossary';
import { cn } from '@/lib/utils';

type InfoTipProps = {
  /** 용어집(`lib/glossary.ts`) 키 — 예: '정산주기' */
  term: string;
  /** 카드가 뜨는 방향 (기본 'top') */
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** trigger 래퍼에 덧붙일 클래스 (표 헤더 크기 조정 등) */
  className?: string;
};

/**
 * 어려운 용어 옆에 붙이는 작은 ⓘ 아이콘.
 * 마우스를 올리면(데스크톱) 또는 탭/클릭하면(모바일) 용어 설명 카드가 뜬다.
 * 설명 텍스트는 `lib/glossary.ts` 한 곳에서만 관리한다.
 */
export function InfoTip({ term, side = 'top', className }: InfoTipProps) {
  const entry = getGlossaryEntry(term);
  if (!entry) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[InfoTip] 용어집에 없는 term: "${term}"`);
    }
    return null;
  }

  return (
    <Popover.Root>
      <Popover.Trigger
        type="button"
        aria-label={`${entry.label} 설명`}
        // 폼 안에서는 제출을, 정렬 헤더 같은 부모에서는 클릭 핸들러를 일으키지 않도록
        onClick={(e) => e.stopPropagation()}
        openOnHover
        delay={150}
        closeDelay={0}
        className={cn(
          'inline-flex size-[18px] shrink-0 items-center justify-center align-middle text-[var(--md-sys-color-on-surface-variant)] outline-none transition-colors hover:text-[var(--md-sys-color-on-surface)] focus-visible:text-[var(--md-sys-color-on-surface)]',
          className,
        )}
      >
        <InfoIcon size={14} aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side={side} sideOffset={6} className="isolate z-50">
          <Popover.Popup
            className={cn(
              'z-50 max-w-xs origin-(--transform-origin) rounded-[var(--md-sys-shape-extra-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] px-3 py-2 text-[13px] leading-relaxed shadow-md',
              'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
              'data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
            )}
          >
            <Popover.Title className="mb-0.5 text-[13px] font-medium text-[var(--md-sys-color-on-surface)]">
              {entry.label}
            </Popover.Title>
            <Popover.Description className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
              {entry.description}
            </Popover.Description>
            <Popover.Arrow className="size-2.5 -translate-y-[3px] rotate-45 rounded-[2px] border-b border-r border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] data-[side=bottom]:-top-1 data-[side=top]:-bottom-1" />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
