'use client';

import { PaperclipIcon } from '@/components/icons';
import { NEW_TAB_NOTICE } from '@/lib/a11y/link-notice';

/**
 * 메시지 버블 내 컴팩트 첨부파일 그리드 — 헤더 없음, 2열 소형 타일.
 * 상대방 채팅(ThreadView)·팀 채팅(TeamThreadView) 공용 단일 출처.
 */
export function MessageAttachmentGrid({
  attachments,
}: {
  attachments: { id: string; name: string; mimeType: string; url: string }[];
}) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-1.5">
      {attachments.map((att) => {
        const isImage = att.mimeType?.startsWith('image/');
        return (
          <a
            key={att.id}
            href={att.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-1.5 overflow-hidden rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-2 py-1.5 transition-colors hover:border-[var(--md-sys-color-outline)]"
          >
            {isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={att.url} alt={att.name} className="h-8 w-8 shrink-0 rounded-sm object-cover" />
            ) : (
              <PaperclipIcon size={14} className="shrink-0 text-[var(--md-sys-color-on-surface-variant)]" />
            )}
            <span className="min-w-0 truncate text-xs text-[var(--md-sys-color-on-surface)]">
              {att.name}
            </span>
            <span className="sr-only">{NEW_TAB_NOTICE}</span>
          </a>
        );
      })}
    </div>
  );
}
