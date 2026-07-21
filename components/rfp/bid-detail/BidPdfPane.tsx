import { FileTextIcon } from '@/components/icons';
import type { Attachment } from '@/lib/types/common';

/** Left pane of the bid detail modal: the proposal PDF preview, or an empty
 *  state when the PG attached no PDF. */
export function BidPdfPane({ pdf }: { pdf?: Attachment }) {
  return (
    <div className="bg-[var(--md-sys-color-surface-container-high)] border-r border-[var(--md-sys-color-outline-variant)] min-h-[400px] md:min-h-[640px] flex flex-col">
      <PdfPreview pdf={pdf} />
    </div>
  );
}

function PdfPreview({ pdf }: { pdf?: Attachment }) {
  const hasPdf = pdf?.url && pdf.name !== '견적서 미첨부';
  if (!hasPdf) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
        <FileTextIcon size={28} />
        <p className="mt-3 md-label-small text-[var(--md-sys-color-on-surface-variant)]">
          견적서 미첨부
        </p>
        <p className="mt-1 text-[12px] text-[var(--md-sys-color-outline)]">
          PG가 견적을 보낼 때 PDF를 함께 업로드해요.
        </p>
      </div>
    );
  }
  return (
    <>
      <div className="px-4 py-2 border-b border-[var(--md-sys-color-outline-variant)] flex items-center gap-2 shrink-0">
        <FileTextIcon size={14} />
        <span className="md-label-small text-[var(--md-sys-color-on-surface-variant)] truncate flex-1">
          {pdf.name}
        </span>
        <a
          href={pdf.url}
          target="_blank"
          rel="noopener noreferrer"
          className="md-label-small text-[var(--md-sys-color-on-surface)] hover:underline"
        >
          새 창 열기 →
        </a>
      </div>
      <iframe
        src={pdf.url}
        title={pdf.name}
        className="flex-1 w-full bg-white"
      />
    </>
  );
}
