'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { FileTextIcon } from '@/components/icons';
import type { Attachment } from '@/lib/types/common';

// 구매사가 RFP에 붙인 첨부파일을 썸네일 목록으로 보여주고, 클릭 시 MD3 Dialog
// 라이트박스 안에서 이미지/PDF 를 인라인으로 미리본다. 구매사 상세 + PG 인박스
// 양쪽에서 재사용 (서빙·ACL 은 GET /api/files/{id} 가 담당).
export function AttachmentPreviewList({ files }: { files: Attachment[] }) {
  const [selected, setSelected] = useState<Attachment | null>(null);

  // 첨부가 없으면 섹션 자체를 렌더하지 않는다 (MD3: 빈/일러스트 empty state 금지).
  if (files.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <span className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
          첨부파일 ({files.length})
        </span>
        <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
      </div>
      <ul className="flex flex-wrap gap-3">
        {files.map((f) => (
          <li key={f.id}>
            <AttachmentThumb attachment={f} onClick={() => setSelected(f)} />
          </li>
        ))}
      </ul>
      <AttachmentPreviewDialog
        attachment={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

function AttachmentThumb({
  attachment,
  onClick,
}: {
  attachment: Attachment;
  onClick: () => void;
}) {
  const isImage = attachment.mimeType?.startsWith('image/');
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-24 flex-col items-start gap-1.5 text-left cursor-pointer"
    >
      <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] transition-colors group-hover:border-[var(--md-sys-color-outline)]">
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={attachment.url}
            alt={attachment.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <FileTextIcon size={28} />
        )}
      </div>
      <span className="w-24 truncate text-[12px] text-[var(--md-sys-color-on-surface)]">
        {attachment.name}
      </span>
    </button>
  );
}

function AttachmentPreviewDialog({
  attachment,
  onClose,
}: {
  attachment: Attachment | null;
  onClose: () => void;
}) {
  const isImage = attachment?.mimeType?.startsWith('image/');
  return (
    <Dialog
      open={!!attachment}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex h-[88vh] w-[92vw] flex-col overflow-hidden rounded-lg p-0 sm:max-w-[920px]">
        <DialogTitle className="sr-only">
          {attachment?.name ?? '첨부파일'} 미리보기
        </DialogTitle>
        <DialogDescription className="sr-only">
          구매사가 견적 요청에 첨부한 파일을 미리 봐요.
        </DialogDescription>
        {attachment && (
          <>
            <div className="flex shrink-0 items-center gap-2 border-b border-[var(--md-sys-color-outline-variant)] px-4 py-2.5">
              <FileTextIcon size={14} />
              <span className="flex-1 truncate font-mono text-[11px] tracking-[0.08em] text-[var(--md-sys-color-on-surface-variant)]">
                {attachment.name}
              </span>
              <a
                href={attachment.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mr-8 shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--md-sys-color-on-surface)] hover:underline"
              >
                새 창 열기 →
              </a>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[var(--md-sys-color-surface-container-high)]">
              {isImage ? (
                <ImagePreview attachment={attachment} />
              ) : (
                <iframe
                  src={attachment.url}
                  title={attachment.name}
                  className="h-full w-full bg-white"
                />
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ImagePreview({ attachment }: { attachment: Attachment }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <div className="flex flex-col items-center gap-2 px-8 text-center text-[var(--md-sys-color-on-surface-variant)]">
        <FileTextIcon size={28} />
        <p className="font-mono text-[11px] uppercase tracking-[0.1em]">
          미리보기 불가
        </p>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={attachment.url}
      alt={`${attachment.name} 미리보기`}
      onError={() => setBroken(true)}
      className="max-h-full max-w-full object-contain"
    />
  );
}
