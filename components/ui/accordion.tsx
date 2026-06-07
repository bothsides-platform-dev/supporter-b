'use client';

// Linear 스타일 아코디언 — @base-ui/react/accordion 위의 얇은 래퍼.
// 경계는 outline-variant 헤어라인, 셰브론은 transform 회전(레이아웃 애니메이션 금지).
import type { ReactNode } from 'react';
import { Accordion as BaseAccordion } from '@base-ui/react/accordion';
import { ChevronDownIcon } from '@/components/icons';
import { cn } from '@/lib/utils';

export function Accordion({
  children,
  defaultValue,
  multiple = true,
  className,
}: {
  children: ReactNode;
  /** 기본으로 펼쳐 둘 item value 목록 */
  defaultValue?: string[];
  multiple?: boolean;
  className?: string;
}) {
  return (
    <BaseAccordion.Root
      defaultValue={defaultValue}
      multiple={multiple}
      className={cn(
        'border-t border-[var(--md-sys-color-outline-variant)]',
        className,
      )}
    >
      {children}
    </BaseAccordion.Root>
  );
}

export function AccordionItem({
  value,
  title,
  badge,
  children,
}: {
  value: string;
  title: ReactNode;
  /** 트리거 우측(셰브론 앞)에 붙는 보조 표시 — 예: 대기 N건 칩 */
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <BaseAccordion.Item
      value={value}
      className="border-b border-[var(--md-sys-color-outline-variant)]"
    >
      <BaseAccordion.Header>
        <BaseAccordion.Trigger className="group flex w-full items-center justify-between gap-3 py-3 text-left outline-none">
          <span className="flex items-center gap-2 text-[13px] font-[500] text-[var(--md-sys-color-on-surface)]">
            {title}
          </span>
          <span className="flex items-center gap-2">
            {badge}
            <ChevronDownIcon
              size={16}
              className="text-[var(--md-sys-color-on-surface-variant)] transition-transform duration-150 group-data-[panel-open]:rotate-180"
            />
          </span>
        </BaseAccordion.Trigger>
      </BaseAccordion.Header>
      <BaseAccordion.Panel className="overflow-hidden data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0">
        <div className="pb-4">{children}</div>
      </BaseAccordion.Panel>
    </BaseAccordion.Item>
  );
}
