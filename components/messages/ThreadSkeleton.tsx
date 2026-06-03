export function ThreadSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-[var(--md-sys-color-outline-variant)] px-4 py-3">
        <div className="h-8 w-8 animate-pulse rounded-full bg-[var(--md-sys-color-surface-container-high)]" />
        <div className="h-4 w-32 animate-pulse rounded bg-[var(--md-sys-color-surface-container-high)]" />
      </div>
      <div className="flex-1" />
      <div className="border-t border-[var(--md-sys-color-outline-variant)] p-3">
        <div className="h-20 animate-pulse rounded-[var(--md-sys-shape-medium)] bg-[var(--md-sys-color-surface-container)]" />
      </div>
    </div>
  );
}
