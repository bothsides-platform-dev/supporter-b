'use client';

import { SearchIcon } from '@/components/icons';
import { ModifierShortcut } from '@/components/primitives/ModifierShortcut';
import { useUIStore } from '@/lib/stores/ui';
import { useIsMac } from '@/lib/hooks/usePlatform';
import { cn } from '@/lib/utils';

type SearchBarProps = {
  className?: string;
};

/**
 * SearchBar — header search trigger. Button-styled (not a real input): clicking
 * it (or ⌘ K) opens the command palette. Shows the platform-aware modifier hint.
 * Linear: 1px outline-variant border, hover = background shift only (no shadow).
 */
export function SearchBar({ className }: SearchBarProps) {
  const openCommandPalette = useUIStore((s) => s.openCommandPalette);
  const isMac = useIsMac();

  return (
    <button
      type="button"
      onClick={() => openCommandPalette()}
      className={cn(
        'group flex h-8 w-full max-w-[420px] items-center gap-2 rounded-[var(--md-sys-shape-small)]',
        'border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)] px-2.5',
        'text-[length:var(--md-typescale-body-medium-size)] text-[var(--md-sys-color-on-surface-variant)]',
        'transition-colors hover:bg-[var(--md-sys-color-surface-container)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50',
        className,
      )}
    >
      <SearchIcon size={16} className="shrink-0" />
      <span className="flex-1 text-left">검색…</span>
      <ModifierShortcut shortcutKey="K" isMac={isMac} className="shrink-0" />
    </button>
  );
}
