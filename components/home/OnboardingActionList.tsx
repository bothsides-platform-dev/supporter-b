import Link from 'next/link';
import type { OnboardingAction } from '@/lib/server/dashboard/buildDashboard';

export function OnboardingActionList({ actions }: { actions: OnboardingAction[] }) {
  if (actions.length === 0) return null;

  const [primary, ...secondary] = actions;

  return (
    <div className="flex flex-col gap-2">
      <Link
        href={primary.href}
        className="flex items-center justify-between gap-4 rounded-[var(--md-sys-shape-medium)] border border-[var(--md-sys-color-primary-container)] bg-[var(--md-sys-color-primary-container)] px-4 py-3.5 transition-opacity hover:opacity-90"
      >
        <div className="flex flex-col gap-0.5">
          <span className="text-[14px] font-semibold text-[var(--md-sys-color-on-primary-container)]">
            {primary.title}
          </span>
          {primary.description && (
            <span className="text-[12px] text-[var(--md-sys-color-on-primary-container)] opacity-70">
              {primary.description}
            </span>
          )}
        </div>
        <span className="shrink-0 rounded-[var(--md-sys-shape-small)] bg-[var(--md-sys-color-primary)] px-3 py-1.5 text-[13px] font-medium text-[var(--md-sys-color-on-primary)]">
          RFP 작성해요
        </span>
      </Link>
      {secondary.length > 0 && (
        <ul className="flex flex-col">
          {secondary.map((action) => (
            <li key={action.id}>
              <Link
                href={action.href}
                className="flex items-center justify-between gap-3 border-b border-[var(--md-sys-color-outline-variant)] py-2.5 text-[14px] transition-colors hover:bg-[var(--md-sys-color-surface-container)]"
              >
                <span className="text-[var(--md-sys-color-on-surface)]">{action.title}</span>
                <span className="text-[12px] text-[var(--md-sys-color-on-surface-variant)]">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
