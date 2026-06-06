'use client';

import { useState } from 'react';

export function SubmittedSummary({ rows }: { rows: [string, string][] }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
      >
        보낸 내용 보기 {open ? '▴' : '▾'}
      </button>
      {open && (
        <div className="mt-3 divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
          {rows.map(([label, value]) => (
            <div key={label} className="py-2.5 flex items-baseline justify-between">
              <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">{label}</span>
              <span className="font-mono text-[13px] tabular-nums text-[var(--md-sys-color-on-surface)]">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
