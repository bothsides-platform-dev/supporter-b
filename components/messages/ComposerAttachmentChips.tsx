'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { XIcon } from '@/components/icons';
import type { ComposerAttachment } from './useComposerAttachments';

/**
 * 컴포저 하단 첨부 칩 줄 — uploading/error/ready 3상태.
 * ThreadView·TeamThreadView 가 글자 단위로 복제하던 블록의 단일 출처
 * (상대방·팀 채팅 공용). 빈 목록이면 아무것도 렌더하지 않는다.
 */
export function ComposerAttachmentChips({
  rows,
  onRemove,
}: {
  rows: ComposerAttachment[];
  onRemove: (id: string) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="flex shrink-0 flex-wrap gap-1.5 border-t border-[var(--md-sys-color-outline-variant)] px-3 pt-2 pb-1">
      {rows.map((a) =>
        a.status === 'uploading' ? (
          // 업로드 중 — 파일명 + 펄스 스켈레톤(제거 불가, 올리는 중임을 표시).
          <span
            key={a.id}
            aria-busy="true"
            aria-label={`${a.name} 업로드 중`}
            className="inline-flex animate-pulse items-center gap-1 rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] px-2 py-1 text-[12px] text-[var(--md-sys-color-on-surface-variant)]"
          >
            <span className="max-w-[160px] truncate">{a.name}</span>
            <Skeleton className="size-3 rounded-full" />
          </span>
        ) : a.status === 'error' ? (
          // 업로드 실패 — 에러 메시지 + 제거 버튼.
          <span
            key={a.id}
            aria-label={`${a.name} 업로드 실패`}
            title={a.error}
            className="inline-flex items-center gap-1 rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-error)] px-2 py-1 text-[12px] text-[var(--md-sys-color-error)]"
          >
            <span className="max-w-[160px] truncate">{a.name}</span>
            <button
              type="button"
              aria-label={`${a.name} 첨부 제거`}
              onClick={() => onRemove(a.id)}
              className="hover:opacity-70"
            >
              <XIcon size={12} />
            </button>
          </span>
        ) : (
          <span
            key={a.id}
            className="inline-flex items-center gap-1 rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] px-2 py-1 text-[12px] text-[var(--md-sys-color-on-surface)]"
          >
            <span className="max-w-[160px] truncate">{a.name}</span>
            <button
              type="button"
              aria-label={`${a.name} 첨부 제거`}
              onClick={() => onRemove(a.id)}
              className="text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-error)]"
            >
              <XIcon size={12} />
            </button>
          </span>
        ),
      )}
    </div>
  );
}
