import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { ActionGroup } from '@/lib/server/dashboard/buildDashboard';

export function ActionQueue({ groups, showActions = false }: { groups: ActionGroup[]; showActions?: boolean }) {
  const Heading = showActions ? 'h2' : 'h3';
  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <section key={group.id}>
          <Heading className={`${showActions ? 'md-label-medium mb-2' : 'mb-1.5 text-[12px] font-medium'} flex items-center gap-1.5 text-[var(--md-sys-color-on-surface-variant)]`}>
            {group.label}
            <span className="md-numeric">{group.items.length}</span>
          </Heading>
          <ul className="flex flex-col">
            {group.items.map((item) => (
              <li key={item.id}>
                {showActions ? <div className="flex min-w-0 flex-col gap-3 border-b border-[var(--md-sys-color-outline-variant)] py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <p className="break-words text-[14px] font-medium">{item.title}</p>
                    <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">{item.badge}</p>
                  </div>
                  <Link href={item.href} aria-label={`${item.title} · ${item.actionLabel}`} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 self-start rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] px-3 text-[14px] font-medium text-primary transition-colors hover:bg-[var(--md-sys-color-surface-container)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:min-h-8 sm:self-auto">
                    {item.actionLabel}<ArrowRight aria-hidden size={14} />
                  </Link>
                </div> : <Link
                  href={item.href}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--md-sys-color-outline-variant)] px-3 py-2.5 text-[14px] transition-colors hover:bg-[var(--md-sys-color-surface-container)]"
                >
                  <span className="truncate text-[var(--md-sys-color-on-surface)]">{item.title}</span>
                  {item.actionLabel ? (
                    <span className="shrink-0 text-sm font-medium text-[var(--md-sys-color-primary)]">{item.actionLabel}</span>
                  ) : (
                    <span className="md-numeric shrink-0 text-[12px] text-[var(--md-sys-color-on-surface-variant)]">{item.badge}</span>
                  )}
                </Link>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
