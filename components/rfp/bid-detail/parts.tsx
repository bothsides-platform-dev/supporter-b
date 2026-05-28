import type { ReactNode } from 'react';

/** Small mono uppercase section label shared by the KPI grid and notes panel. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
      {children}
    </span>
  );
}
