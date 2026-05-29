'use client';

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { IconButton } from '@/components/primitives/IconButton';
import { XIcon } from '@/components/icons';
import { MessageComposeButton } from '@/components/messages/MessageComposeButton';
import type { Bid } from '@/lib/types/bid';
import type { MerchantGrade } from '@/lib/types/biz-profile';
import type { BidNote } from '@/lib/types/bid-note';
import { BidPdfPane } from './bid-detail/BidPdfPane';
import { BidKpiGrid } from './bid-detail/BidKpiGrid';
import { BidNotesPanel } from './bid-detail/BidNotesPanel';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bid: Bid | null;
  notes: BidNote[];
  pgName: string;
  grade: MerchantGrade | undefined;
  // Accepted for caller compatibility; the note author is derived server-side.
  authorId: string;
  authorName: string;
};

/**
 * Thin shell: dialog + two-column layout. Left = proposal PDF (BidPdfPane);
 * right = read-only KPI grid (BidKpiGrid) + negotiation history (BidNotesPanel).
 * All state lives inside those sub-components — this wrapper holds none.
 */
export function BidDetailModal({
  open,
  onOpenChange,
  bid,
  notes,
  pgName,
  grade,
  authorId: _authorId,
  authorName: _authorName,
}: Props) {
  if (!bid) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[640px]" />
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[960px] w-[95vw] max-h-[88vh] grid grid-cols-1 md:grid-cols-[1fr_360px] gap-0 p-0 overflow-hidden rounded-lg"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">{pgName} 제안 상세</DialogTitle>
        <DialogDescription className="sr-only">
          제안서 PDF, 6컬럼 수치, 협상 메모 히스토리를 확인하고 새 메모/첨부를 기록할 수 있습니다.
        </DialogDescription>

        {/* Left: PDF preview */}
        <BidPdfPane pdf={bid.proposalPdfs[0]} />

        {/* Right: meta + history */}
        <div className="flex flex-col max-h-[88vh] overflow-hidden">
          <header className="flex items-start justify-between gap-3 p-5 border-b border-[var(--md-sys-color-outline-variant)] shrink-0">
            <div>
              <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[var(--md-sys-color-outline)]">
                {bid.id}
              </span>
              <h2 className="text-[20px] font-[600] tracking-[-0.01em] text-[var(--md-sys-color-on-surface)] mt-1">
                {pgName}
              </h2>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <MessageComposeButton
                variant="avatar"
                counterparty={{ name: pgName, type: 'pg', workspaceId: bid.pgWsId }}
              />
              <IconButton label="닫기" size="sm" onClick={() => onOpenChange(false)}>
                <XIcon size={18} />
              </IconButton>
            </div>
          </header>

          <div className="overflow-y-auto flex-1">
            <BidKpiGrid bid={bid} grade={grade} />
            <BidNotesPanel bidId={bid.id} notes={notes} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
