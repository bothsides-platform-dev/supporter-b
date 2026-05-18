'use client';

import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

type Props = {
  stageId: string;
  label: string;
  count: number;
  dotColor: 'surface' | 'primary' | 'tertiary' | 'warning' | 'error';
  /** finality 컬럼 (낙찰/종료/won/lost) — 드롭 비활성. */
  frozen?: boolean;
  cta?: ReactNode;
  children: ReactNode;
};

const dotClass: Record<Props['dotColor'], string> = {
  surface: 'bg-[var(--md-sys-color-outline-variant)]',
  primary: 'bg-[var(--md-sys-color-primary)]',
  tertiary: 'bg-[var(--md-sys-color-tertiary)]',
  warning: 'bg-[var(--md-sys-color-warning)]',
  error: 'bg-[var(--md-sys-color-error)]',
};

export function KanbanColumn({
  stageId,
  label,
  count,
  dotColor,
  frozen = false,
  cta,
  children,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column:${stageId}`,
    disabled: frozen,
  });

  return (
    <section
      ref={setNodeRef}
      className={cn(
        'flex flex-col w-72 lg:w-auto lg:min-w-[160px] shrink-0 snap-start bg-[var(--md-sys-color-surface-container)] rounded-[var(--md-sys-shape-medium)] p-3 min-h-[400px] transition-colors',
        isOver &&
          !frozen &&
          'bg-[var(--md-sys-color-surface-container-high)] outline outline-1 outline-dashed outline-[var(--md-sys-color-outline)]',
      )}
    >
      <header className="flex items-center justify-between gap-2 mb-3 px-1">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${dotClass[dotColor]}`}
          />
          <span className="text-[13px] font-medium text-[var(--md-sys-color-on-surface)]">
            {label}
          </span>
        </div>
        <span className="font-mono text-[12px] tabular-nums text-[var(--md-sys-color-on-surface-variant)]">
          {count}
        </span>
      </header>
      <div className="flex-1 flex flex-col gap-2">
        {cta}
        {count === 0 && !cta && (
          <p className="text-center py-8 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
            —
          </p>
        )}
        {children}
      </div>
    </section>
  );
}
