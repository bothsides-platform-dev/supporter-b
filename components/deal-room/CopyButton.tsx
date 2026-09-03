'use client';

import { Copy } from 'lucide-react';
import { toast } from '@/lib/toast';

export function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <button
      type="button"
      aria-label={`${label} 복사`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          toast('복사했어요', { type: 'success' });
        } catch {
          toast('복사하지 못했어요', { type: 'error' });
        }
      }}
      className="ml-auto flex shrink-0 items-center gap-1 rounded-[6px] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-2 py-[3px] text-xs text-[var(--md-sys-color-on-surface-variant)] transition-colors hover:bg-[var(--md-sys-color-surface-container)]"
    >
      <Copy size={12} aria-hidden />
      복사
    </button>
  );
}
