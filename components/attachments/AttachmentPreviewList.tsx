'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { FileTextIcon, PaperclipIcon } from '@/components/icons';
import type { Attachment } from '@/lib/types/common';
import { Divider } from '@/components/primitives/Divider';
import { EmptyState } from '@/components/primitives/EmptyState';

const MAX_ACTIVE_PDF_PREVIEWS = 2;
let activePdfPreviews = 0;
const pendingPdfPreviews: Array<() => void> = [];
let pdfJsModule: Promise<typeof import('pdfjs-dist')> | undefined;

function loadPdfJs() {
  return pdfJsModule ??= import('pdfjs-dist').catch((error) => {
    pdfJsModule = undefined;
    throw error;
  });
}

function runPdfPreview(signal: AbortSignal, render: () => Promise<void>): Promise<void> {
  return new Promise((resolve, reject) => {
    let started = false;
    let settled = false;
    const drain = () => {
      while (activePdfPreviews < MAX_ACTIVE_PDF_PREVIEWS && pendingPdfPreviews.length > 0) {
        pendingPdfPreviews.shift()?.();
      }
    };
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      if (started) {
        activePdfPreviews -= 1;
        drain();
      }
      if (error) reject(error);
      else resolve();
    };
    const onAbort = () => {
      if (!started) {
        const index = pendingPdfPreviews.indexOf(start);
        if (index >= 0) pendingPdfPreviews.splice(index, 1);
      }
      finish(new DOMException('Preview canceled', 'AbortError'));
    };
    const start = () => {
      if (settled) return;
      started = true;
      activePdfPreviews += 1;
      void render().then(() => finish(), finish);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
    else if (activePdfPreviews < MAX_ACTIVE_PDF_PREVIEWS) start();
    else pendingPdfPreviews.push(start);
  });
}

// 구매사가 견적 요청에 붙인 첨부파일을 썸네일 목록으로 보여주고, 클릭 시 Dialog
// 라이트박스 안에서 이미지/PDF 를 인라인으로 미리본다. 구매사 상세 + PG 인박스
// 양쪽에서 재사용 (서빙·ACL 은 GET /api/files/{id} 가 담당).
export function AttachmentPreviewList({ files }: { files: Attachment[] }) {
  const [selected, setSelected] = useState<Attachment | null>(null);

  if (files.length === 0) {
    return (
      <EmptyState
        icon={<PaperclipIcon />}
        title="첨부파일 없이 견적을 요청했어요."
        description="요청 내용은 요청 조건에서 확인해요."
        className="rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]"
      />
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <span className="md-label-small text-[var(--md-sys-color-on-surface-variant)]">
          첨부파일 ({files.length})
        </span>
        <Divider />
      </div>
      <ul className="flex flex-wrap gap-4">
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

function ThumbImage({ url, name }: { url: string; name: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return <FileTextIcon size={28} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={name}
      onError={() => setBroken(true)}
      className="h-full w-full object-contain"
    />
  );
}

function PdfThumbnail({ attachment }: { attachment: Attachment }) {
  const targetRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const target = targetRef.current;
    if (!target || !('IntersectionObserver' in window)) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '200px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const abort = new AbortController();
    let active = true;
    let releasePdf = () => {};
    let cancelRender = () => {};

    void runPdfPreview(abort.signal, async () => {
      try {
        const pdfjs = await loadPdfJs();
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString();
        if (!active) return;

        const response = await fetch(`/api/files/${encodeURIComponent(attachment.id)}?preview=1`, {
          signal: abort.signal,
        });
        if (!response.ok) throw new Error('PDF preview unavailable');
        const bytes = await response.arrayBuffer();
        if (!active) return;

        const task = pdfjs.getDocument({ data: bytes });
        releasePdf = () => {
          releasePdf = () => {};
          void task.destroy();
        };
        const document = await task.promise;
        if (!active) return;
        const page = await document.getPage(1);
        if (!active) return;

        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        if (!canvas || !context) throw new Error('Canvas unavailable');
        const natural = page.getViewport({ scale: 1 });
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const scale = Math.min(120 / natural.width, 152 / natural.height) * pixelRatio;
        const viewport = page.getViewport({ scale });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.style.width = `${viewport.width / pixelRatio}px`;
        canvas.style.height = `${viewport.height / pixelRatio}px`;
        const rendering = page.render({ canvasContext: context, canvas, viewport });
        cancelRender = () => rendering.cancel();
        await rendering.promise;
        releasePdf();
        if (active) setState('ready');
      } catch {
        releasePdf();
        if (active) setState('failed');
      }
    }).catch(() => {});

    return () => {
      active = false;
      abort.abort();
      cancelRender();
      releasePdf();
    };
  }, [attachment.id, visible]);

  return (
    <span ref={targetRef} className="flex h-full w-full items-center justify-center">
      {state === 'loading' && <FileTextIcon size={28} />}
      {state === 'failed' && (
        <span className="flex flex-col items-center gap-1 text-center text-xs">
          <FileTextIcon size={24} />
          미리보기 불가
        </span>
      )}
      <canvas
        ref={canvasRef}
        role={state === 'ready' ? 'img' : undefined}
        aria-label={state === 'ready' ? `${attachment.name} 첫 페이지 미리보기` : undefined}
        className={state === 'ready' ? 'max-h-full max-w-full' : 'hidden'}
      />
    </span>
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
  const isPdf = attachment.mimeType === 'application/pdf';
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-32 flex-col items-start gap-1.5 text-left cursor-pointer"
    >
      <div className="flex h-40 w-32 items-center justify-center overflow-hidden rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] transition-colors group-hover:border-[var(--md-sys-color-outline)]">
        {isImage ? (
          <ThumbImage url={attachment.url} name={attachment.name} />
        ) : isPdf ? (
          <PdfThumbnail attachment={attachment} />
        ) : (
          <FileTextIcon size={28} />
        )}
      </div>
      <span className="w-32 truncate text-[13px] text-[var(--md-sys-color-on-surface)]">
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
              <span className="flex-1 truncate md-label-small text-[var(--md-sys-color-on-surface-variant)]">
                {attachment.name}
              </span>
              <a
                href={attachment.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mr-8 shrink-0 md-label-small text-[var(--md-sys-color-on-surface)] hover:underline"
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
        <p className="md-label-small">
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
