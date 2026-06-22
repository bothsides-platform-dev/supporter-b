/** 날짜 구분선 — 가운데 은은한 surface 칩. ThreadView·TeamThreadView 공용(드리프트 방지). */
export function DateDivider({ label }: { label: string }) {
  return (
    <div role="separator" className="flex justify-center py-1.5">
      <span className="rounded-[var(--md-sys-shape-full)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] px-2.5 py-0.5 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
        {label}
      </span>
    </div>
  );
}
