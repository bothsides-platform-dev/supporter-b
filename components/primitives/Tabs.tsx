'use client';
import { cn } from '@/lib/utils';

type Tab = { id: string; label: string; count?: number };
type TabsProps = { tabs: Tab[]; active: string; onChange: (id: string) => void; className?: string };

const activeTabClass = [
  'text-[var(--md-sys-color-on-surface)]',
  'after:absolute after:bottom-[-1px] after:left-0 after:right-0',
  'after:h-[2px] after:bg-[var(--md-sys-color-primary)]',
].join(' ');

const inactiveTabClass = [
  'text-[var(--md-sys-color-on-surface-variant)]',
  'hover:text-[var(--md-sys-color-on-surface)]',
].join(' ');

export function Tabs({ tabs, active, onChange, className }: TabsProps) {
  return (
    <div role="tablist" className={cn('flex border-b border-[var(--md-sys-color-outline-variant)]', className)}>
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={cn(
              'relative px-3 h-9 transition-colors cursor-pointer',
              'text-[length:var(--md-typescale-label-large-size)]',
              'font-[number:var(--md-typescale-label-large-weight)]',
              'tracking-[var(--md-typescale-label-large-tracking)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50',
              isActive ? activeTabClass : inactiveTabClass,
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1.5 md-numeric">{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
