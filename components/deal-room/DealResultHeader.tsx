import type { ReactNode } from 'react';
import { CheckCircle2, Flag } from 'lucide-react';

export function DealResultHeader({
  tone,
  title,
  subtitle,
  children,
}: {
  tone: 'award' | 'neutral';
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  const award = tone === 'award';
  return (
    <section>
      <h3
        className={
          award
            ? 'flex items-center gap-2 text-[16px] font-bold text-[var(--md-sys-color-tertiary)]'
            : 'flex items-center gap-2 text-[15px] font-bold text-[var(--md-sys-color-on-surface)]'
        }
      >
        {award ? (
          <CheckCircle2 size={20} aria-hidden />
        ) : (
          <Flag size={19} className="text-[var(--md-sys-color-on-surface-variant)]" aria-hidden />
        )}
        {title}
      </h3>
      {subtitle && (
        <p className="mt-1.5 pl-7 text-[12px] text-[var(--md-sys-color-on-surface-variant)]">{subtitle}</p>
      )}
      {children && <div className="mt-4">{children}</div>}
    </section>
  );
}
