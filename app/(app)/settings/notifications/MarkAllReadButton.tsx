'use client';

import { useRouter } from 'next/navigation';
import { useNotifications } from '@/lib/hooks/useNotifications';

export function MarkAllReadButton() {
  const router = useRouter();
  const { markAllRead } = useNotifications();
  return (
    <button
      type="button"
      onClick={() => { void markAllRead().then(() => router.refresh()); }}
      className="md-label-small text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
    >
      모두 읽음
    </button>
  );
}
