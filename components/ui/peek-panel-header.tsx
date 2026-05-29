'use client';

import { useRouter } from 'next/navigation';
import { MaximizeIcon, XIcon } from '@/components/icons';
import { useClosePeek } from '@/lib/hooks/useClosePeek';

interface PeekPanelHeaderProps {
  rfpCode: string;
  fullscreenHref: string;
}

export function PeekPanelHeader({ rfpCode, fullscreenHref }: PeekPanelHeaderProps) {
  const router = useRouter();
  const handleClose = useClosePeek();

  function handleFullscreen() {
    router.push(fullscreenHref);
  }

  return (
    <div className="flex h-9 shrink-0 items-center border-b border-[var(--md-sys-color-outline-variant)] px-4">
      <span className="font-mono text-[12px] tabular-nums text-[var(--md-sys-color-on-surface-variant)]">
        {rfpCode}
      </span>
      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={handleFullscreen}
          aria-label="전체화면"
          className="flex items-center gap-1 rounded-sm px-2 py-1 text-[11px] text-[var(--md-sys-color-on-surface-variant)] border border-[var(--md-sys-color-outline-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors"
        >
          <MaximizeIcon size={12} /> 전체화면
        </button>
        <button
          onClick={handleClose}
          aria-label="닫기"
          className="flex h-6 w-6 items-center justify-center rounded-sm text-[12px] text-[var(--md-sys-color-on-surface-variant)] border border-[var(--md-sys-color-outline-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors"
        >
          <XIcon size={12} />
        </button>
      </div>
    </div>
  );
}
