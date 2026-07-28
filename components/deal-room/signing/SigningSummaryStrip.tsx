'use client';

/**
 * SigningSummaryStrip — 계약 탭 밖(견적 비교·견적 작성)에 남는 38px 한 줄.
 * 다른 탭에 머무는 동안에도 서명 상태 변화를 놓치지 않게 한다. 클릭하면 계약 탭으로.
 */
import { ChevronRight, FileSignature } from 'lucide-react';

import { TONE_COLOR_VAR } from '@/components/primitives/Chip';
import type { SigningView } from '@/lib/types/signing';
import { buildSigningSummary, type SigningSide } from './signing-view-model';

const dim = 'text-[var(--md-sys-color-on-surface-variant)]';

export function SigningSummaryStrip({
  signing,
  side,
  onOpen,
}: {
  signing: SigningView;
  side: SigningSide;
  onOpen: () => void;
}) {
  const s = buildSigningSummary(signing, side);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mb-4 flex h-[38px] w-full items-center gap-2.5 rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)] px-3 text-left text-[12.5px] transition-colors hover:bg-[var(--md-sys-color-surface-container-low)]"
    >
      <FileSignature className={'size-[15px] shrink-0 ' + dim} aria-hidden />
      <span className="font-medium">전자서명</span>
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full"
        style={{ background: TONE_COLOR_VAR[s.dot] }}
      />
      <span className={'min-w-0 truncate ' + dim}>
        {s.label}
        {s.total !== undefined && (
          <>
            {' · '}
            <span className="md-numeric">{s.signed}</span>/
            <span className="md-numeric">{s.total}</span>
          </>
        )}
      </span>
      <span className={'ml-auto flex shrink-0 items-center gap-0.5 text-[12px] ' + dim}>
        보기
        <ChevronRight className="size-[13px]" aria-hidden />
      </span>
    </button>
  );
}
