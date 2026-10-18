import { FileTextIcon } from '@/components/icons';
import type { Attachment } from '@/lib/types/common';

/** The proposal PDF preview, or a one-line notice when the bid has no PDF. */
export function BidPdfPane({ pdf }: { pdf?: Attachment }) {
  const hasPdf = pdf?.url && pdf.name !== '견적서 미첨부';
  if (!hasPdf) {
    // 미리보기할 문서가 없으니 큰 회색 영역 대신 한 줄 안내만 둔다.
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[6px] border border-[var(--md-sys-color-outline-variant)] px-3 py-2 text-[var(--md-sys-color-on-surface-variant)]">
        <FileTextIcon size={16} aria-hidden />
        <p className="md-label-small">견적서 미첨부</p>
        <p className="text-[13px]">PG사가 PDF를 첨부하지 않았어요.</p>
      </div>
    );
  }
  return (
    <div className="bg-[var(--md-sys-color-surface-container-high)] border-r border-[var(--md-sys-color-outline-variant)] min-h-[400px] md:min-h-[640px] flex flex-col">
      <PdfPreview pdf={pdf} />
    </div>
  );
}

function PdfPreview({ pdf }: { pdf: Attachment }) {
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
