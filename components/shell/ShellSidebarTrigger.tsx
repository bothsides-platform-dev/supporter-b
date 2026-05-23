'use client';

import { PanelLeftIcon } from 'lucide-react';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

type ShellSidebarTriggerProps = {
  className?: string;
};

export function ShellSidebarTrigger({ className }: ShellSidebarTriggerProps) {
  const { state } = useSidebar();
  const label = state === 'expanded' ? '사이드바 접기' : '사이드바 펼치기';

  return (
    <SidebarTrigger
      aria-label={label}
      className={cn(
        'size-8 shrink-0 rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)] hover:text-[var(--md-sys-color-on-surface)]',
        className,
      )}
    >
      <PanelLeftIcon size={18} />
      <span className="sr-only">{label}</span>
    </SidebarTrigger>
  );
}
