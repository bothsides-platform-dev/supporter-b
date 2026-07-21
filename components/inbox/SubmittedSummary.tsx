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
        className="md-label-small text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
      >
        보낸 내용 보기 {open ? '▴' : '▾'}
      </button>
      {open && (
        <div className="mt-3 divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
          {rows.map(([label, value]) => (
            <div key={label} className="py-2.5 flex items-baseline justify-between">
              <span className="md-label-small text-[var(--md-sys-color-on-surface-variant)]">{label}</span>
              <span className="md-numeric text-[13px] text-[var(--md-sys-color-on-surface)]">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
