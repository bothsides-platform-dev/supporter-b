'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Label } from '@/components/primitives/Label';

type SubnavItem = { href: string; label: string };

type SubnavProps = {
  title: string;
  items: SubnavItem[];
  action?: React.ReactNode;
};

export function Subnav({ title, items, action }: SubnavProps) {
  const pathname = usePathname();

  return (
    <aside
      className="flex shrink-0 bg-[var(--md-sys-color-surface)] flex-row md:flex-col w-full md:w-[var(--shell-subnav)] border-b md:border-b-0 md:border-r border-[var(--md-sys-color-outline-variant)] overflow-x-auto md:overflow-y-auto"
    >
      <div className="hidden md:flex px-5 py-4 border-b border-[var(--md-sys-color-outline-variant)] items-center justify-between">
        <Label size="md" muted={false}>{title}</Label>
        {action}
      </div>
      <nav className="flex flex-row gap-0.5 p-2 md:flex-col md:px-2 md:py-2">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'relative flex h-8 items-center whitespace-nowrap rounded-[var(--md-sys-shape-small)] px-2.5 text-[length:var(--md-typescale-label-large-size)] tracking-[var(--md-typescale-label-large-tracking)] transition-colors duration-[var(--md-sys-motion-duration-short-4)]',
                active
                  ? 'bg-[var(--md-sys-color-surface-container-high)] font-medium text-[var(--md-sys-color-on-surface)]'
                  : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)] hover:text-[var(--md-sys-color-on-surface)]',
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
