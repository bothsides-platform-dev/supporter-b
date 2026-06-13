'use client';

/**
 * DealRoomShell — 견적 딜룸의 레이아웃 골격(상단바 + 본문).
 *
 * mode='modal' 은 인터셉트 라우트가 띄우는 모달 안에서, mode='page' 는 정식
 * 상세 페이지(새로고침·딥링크·전체화면 진입)에서 렌더된다. 둘 다 같은 본문
 * 컴포넌트를 감싸므로 모달↔페이지 시각이 일치한다.
 *
 * Phase 1 골격: 상단바(코드·제목·상태칩·전체화면·닫기) + 스크롤 본문.
 * 좌측 액션 레일 / 가운데 탭 / 우측 채팅은 후속 Phase 에서 본문으로 합류한다.
 */
import type { ReactNode } from 'react';
import { Maximize2, X } from 'lucide-react';

import { IconButton } from '@/components/primitives/IconButton';

type DealRoomShellProps = {
  mode: 'modal' | 'page';
  /** 사람용 코드 P-YYMM-NNNN */
  code: string;
  title: string;
  /** 전체화면(⤢) 링크 — 정식 상세 페이지 경로. page 모드에선 숨김. */
  fullscreenHref: string;
  statusChip?: ReactNode;
  /** modal 모드 닫기(보통 router.back). */
  onClose?: () => void;
  children: ReactNode;
};

export function DealRoomShell({
  mode,
  code,
  title,
  fullscreenHref,
  statusChip,
  onClose,
  children,
}: DealRoomShellProps) {
  return (
    <div
      data-mode={mode}
      className="flex h-full min-h-0 flex-col bg-[var(--md-sys-color-surface)]"
    >
      <header className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-[var(--md-sys-color-outline-variant)] px-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="md-numeric text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
            {code}
          </span>
          <span className="text-[var(--md-sys-color-outline)]">·</span>
          <span className="truncate text-[14px] font-[600] tracking-[-0.012em] text-[var(--md-sys-color-on-surface)]">
            {title}
          </span>
        </div>
        {statusChip}
        <div className="ml-auto flex items-center gap-0.5">
          {mode === 'modal' && (
            // 전체화면 = canonical 경로로의 하드 내비(전체 새로고침). 모달의 URL 은
            // 이미 /rfp/<code> 이므로 soft-nav 로는 모달↔페이지가 안 바뀐다 —
            // 풀 리로드만 인터셉터를 건너뛰어 정식 페이지를 띄운다(next/link 아님).
            <a
              href={fullscreenHref}
              aria-label="전체화면"
              className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface-variant)] transition-colors hover:bg-[var(--md-sys-color-surface-container)] hover:text-[var(--md-sys-color-on-surface)] [&_svg]:size-4"
            >
              <Maximize2 />
            </a>
          )}
          {mode === 'modal' && onClose && (
            <IconButton label="닫기" size="sm" onClick={onClose}>
              <X />
            </IconButton>
          )}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
