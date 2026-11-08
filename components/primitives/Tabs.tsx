'use client';
import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';

type Tab = { id: string; label: string; count?: number };
type TabsProps = {
  id: string;
  label: string;
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
  /** Content replaced in one stable panel, rather than separate panels per tab. */
  panelId?: string;
};

export function getTabId(id: string, tab: string) {
  return `${id}-tab-${tab}`;
}

export function getTabPanelId(id: string, tab: string) {
  return `${id}-panel-${tab}`;
}

const activeTabClass = [
  'text-[var(--md-sys-color-on-surface)]',
  'after:absolute after:bottom-[-1px] after:left-0 after:right-0',
  'after:h-[2px] after:bg-[var(--md-sys-color-primary)]',
].join(' ');

const inactiveTabClass = [
  'text-[var(--md-sys-color-on-surface-variant)]',
  'hover:text-[var(--md-sys-color-on-surface)]',
].join(' ');

export function Tabs({ id, label, tabs, active, onChange, className, panelId }: TabsProps) {
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const selectedId = tabs.some((tab) => tab.id === active) ? active : tabs[0]?.id;
  const tabStopId = tabs.some((tab) => tab.id === focusedId) ? focusedId : selectedId;

  return (
    <div
      id={id}
      role="tablist"
      aria-label={label}
      onBlur={(event) => {
        // Re-enter through the selected tab after leaving the tab list.
        if (!event.currentTarget.contains(event.relatedTarget)) setFocusedId(null);
      }}
      className={cn('flex border-b border-[var(--md-sys-color-outline-variant)]', className)}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === selectedId;
        return (
          <button
            key={tab.id}
            id={getTabId(id, tab.id)}
            ref={(button) => {
              if (button) buttons.current.set(tab.id, button);
              else buttons.current.delete(tab.id);
            }}
            role="tab"
            type="button"
            aria-selected={isActive}
            aria-controls={panelId ?? getTabPanelId(id, tab.id)}
            tabIndex={tab.id === tabStopId ? 0 : -1}
            onFocus={() => setFocusedId(tab.id)}
            onClick={(event) => {
              event.currentTarget.focus();
              onChange(tab.id);
            }}
            onKeyDown={(event) => {
              if (event.altKey || event.ctrlKey || event.metaKey) return;
              const index = tabs.findIndex((item) => item.id === tab.id);
              let next: number;
              switch (event.key) {
                case 'ArrowRight': next = (index + 1) % tabs.length; break;
                case 'ArrowLeft': next = (index - 1 + tabs.length) % tabs.length; break;
                case 'Home': next = 0; break;
                case 'End': next = tabs.length - 1; break;
                default: return;
              }
              event.preventDefault();
              // Manual activation keeps expensive panels lazy until Enter/Space or click.
              buttons.current.get(tabs[next].id)?.focus();
            }}
            className={cn(
              'relative h-9 cursor-pointer whitespace-nowrap px-3 transition-colors',
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
