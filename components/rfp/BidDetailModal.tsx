'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Chip, type ChipColor } from '@/components/primitives/Chip';
import { Button } from '@/components/primitives/Button';
import { IconButton } from '@/components/primitives/IconButton';
import { PaperclipIcon, XIcon, FileTextIcon } from '@/components/icons';
import { useBidBoardStore } from '@/lib/stores/bid-board';
import { formatKRW, formatPct } from '@/lib/format';
import { STATUTORY_CARD_FEE, type Bid, type BuyerStage } from '@/lib/types/bid';
import {
  GRADE_LABELS,
  type MerchantGrade,
} from '@/lib/types/biz-profile';
import type { Attachment } from '@/lib/types/common';
import type { BidNote } from '@/lib/types/bid-note';

const SETTLE_LABEL: Record<string, string> = {
  'D+0': 'D+0',
  'D+1': 'D+1',
  'D+2': 'D+2',
  weekly: '주1회',
  monthly: '월1회',
};

const stageChipColor: Record<BuyerStage, ChipColor> = {
  pending: 'surface',
  negotiating: 'warning',
  decided: 'tertiary',
};

const stageLabel: Record<BuyerStage, string> = {
  pending: '진행전',
  negotiating: '협상중',
  decided: '결정',
};

const ISSUER_LABEL: Record<string, string> = {
  BC: 'BC', SHINHAN: '신한', SAMSUNG: '삼성', HYUNDAI: '현대',
  KB: 'KB', LOTTE: '롯데', NH: 'NH', HANA: '하나', WOORI: '우리',
};

const MAX_BODY = 2000;
const ACCEPT = 'image/*,application/pdf';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bid: Bid | null;
  pgName: string;
  stage: BuyerStage;
  grade: MerchantGrade | undefined;
  authorId: string;
  authorName: string;
};

export function BidDetailModal({
  open,
  onOpenChange,
  bid,
  pgName,
  stage,
  grade,
  authorId,
  authorName,
}: Props) {
  if (!bid) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[640px]" />
      </Dialog>
    );
  }

  const cardFee = grade ? STATUTORY_CARD_FEE[grade] : NaN;
  const showStatutoryCard = grade && grade !== 'general' && !Number.isNaN(cardFee);
  const issuerEntries = bid.cardFeesByIssuer
    ? Object.entries(bid.cardFeesByIssuer)
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[960px] w-[95vw] max-h-[88vh] grid grid-cols-1 md:grid-cols-[1fr_360px] gap-0 p-0 overflow-hidden rounded-lg"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">
          {pgName} 제안 상세
        </DialogTitle>
        <DialogDescription className="sr-only">
          제안서 PDF, 6컬럼 수치, 협상 메모 히스토리를 확인하고 새 메모/첨부를 기록할 수 있습니다.
        </DialogDescription>

        {/* Left: PDF preview */}
        <div className="bg-[var(--md-sys-color-surface-container-high)] border-r border-[var(--md-sys-color-outline-variant)] min-h-[400px] md:min-h-[640px] flex flex-col">
          <PdfPreview pdf={bid.proposalPdf} />
        </div>

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
              <div className="mt-2">
                <Chip label={stageLabel[stage]} color={stageChipColor[stage]} />
              </div>
            </div>
            <IconButton
              label="닫기"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              <XIcon size={18} />
            </IconButton>
          </header>

          <div className="overflow-y-auto flex-1">
            {/* KPI grid: 6 figures + optional issuer details */}
            <section className="px-5 py-4 border-b border-[var(--md-sys-color-outline-variant)]">
              <SectionLabel>정형 수치</SectionLabel>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 mt-3">
                <Kpi label="정산주기" value={SETTLE_LABEL[bid.settleCycle] ?? bid.settleCycle} />
                <Kpi label="보증금" value={formatKRW(bid.deposit)} />
                <Kpi label="셋업비" value={formatKRW(bid.setupFee)} />
                <Kpi label="월최저" value={formatKRW(bid.monthlyMin)} />
                <Kpi label="계좌이체" value={formatPct(bid.bankTransferFeePct)} />
                <Kpi label="간편결제" value={formatPct(bid.easyPayFeePct)} />
                {showStatutoryCard && (
                  <Kpi
                    label={`카드 (${GRADE_LABELS[grade!]})`}
                    value={`${(cardFee * 100).toFixed(2)}% 고정`}
                    muted
                  />
                )}
                {bid.overseasCardFeePct !== undefined && (
                  <Kpi label="해외 카드" value={formatPct(bid.overseasCardFeePct)} />
                )}
              </dl>
              {grade === 'general' && issuerEntries.length > 0 && (
                <details className="mt-3 group">
                  <summary className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] cursor-pointer hover:text-[var(--md-sys-color-on-surface)] select-none">
                    카드사별 수수료 9개사 ▾
                  </summary>
                  <dl className="grid grid-cols-3 gap-x-4 gap-y-2 mt-3">
                    {issuerEntries.map(([issuer, pct]) => (
                      <Kpi
                        key={issuer}
                        label={ISSUER_LABEL[issuer] ?? issuer}
                        value={formatPct(pct)}
                      />
                    ))}
                  </dl>
                </details>
              )}
            </section>

            {/* History form + timeline */}
            <section className="px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <SectionLabel>히스토리</SectionLabel>
              </div>
              <NoteForm
                bidId={bid.id}
                authorId={authorId}
                authorName={authorName}
              />
              <NoteTimeline bidId={bid.id} />
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PdfPreview({ pdf }: { pdf: Attachment }) {
  const hasPdf = pdf?.url && pdf.name !== '제안서 미첨부';
  if (!hasPdf) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
        <FileTextIcon size={28} />
        <p className="mt-3 font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
          제안서 미첨부
        </p>
        <p className="mt-1 text-[12px] text-[var(--md-sys-color-outline)]">
          PG가 제안 제출 시 PDF를 함께 업로드합니다.
        </p>
      </div>
    );
  }
  return (
    <>
      <div className="px-4 py-2 border-b border-[var(--md-sys-color-outline-variant)] flex items-center gap-2 shrink-0">
        <FileTextIcon size={14} />
        <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] truncate flex-1">
          {pdf.name}
        </span>
        <a
          href={pdf.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface)] hover:underline"
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
      {children}
    </span>
  );
}

function Kpi({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div>
      <dt className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
        {label}
      </dt>
      <dd
        className={
          muted
            ? 'font-mono text-[13px] tabular-nums text-[var(--md-sys-color-on-surface-variant)] mt-0.5'
            : 'font-mono text-[13px] tabular-nums text-[var(--md-sys-color-on-surface)] mt-0.5'
        }
      >
        {value}
      </dd>
    </div>
  );
}

type StagedFile = { id: string; file: File; url: string };

function NoteForm({
  bidId,
  authorId,
  authorName,
}: {
  bidId: string;
  authorId: string;
  authorName: string;
}) {
  const addNote = useBidBoardStore((s) => s.addNote);
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<StagedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Revoke any blob URLs that didn't make it into a submitted note when the
  // form unmounts (modal close) — submitted ones are intentionally kept alive
  // for the modal's session lifetime; they expire on full reload regardless.
  useEffect(() => {
    return () => {
      for (const f of files) URL.revokeObjectURL(f.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFiles = (list: FileList | null) => {
    if (!list) return;
    const arr: StagedFile[] = [];
    for (const file of Array.from(list)) {
      arr.push({
        id: crypto.randomUUID(),
        file,
        url: URL.createObjectURL(file),
      });
    }
    setFiles((prev) => [...prev, ...arr]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((p) => p.id !== id);
    });
  };

  const submit = () => {
    if (!body.trim() && files.length === 0) return;
    const attachments: Attachment[] = files.map((f) => ({
      id: f.id,
      name: f.file.name,
      size: f.file.size,
      mimeType: f.file.type,
      url: f.url,
    }));
    const note: BidNote = {
      id: crypto.randomUUID(),
      bidId,
      authorId,
      authorName,
      body: body.trim(),
      attachments,
      createdAt: new Date().toISOString(),
    };
    addNote(note);
    setBody('');
    setFiles([]);
  };

  return (
    <div className="border border-[var(--md-sys-color-outline-variant)] rounded-md p-3 mt-3 bg-[var(--md-sys-color-surface)]">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
        placeholder="협상 진행, 통화 기록, 결정 근거…"
        rows={3}
        className="block w-full resize-y bg-transparent text-[13px] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] focus:outline-none min-h-[64px] max-h-[160px]"
      />
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-[var(--md-sys-color-outline-variant)]">
          {files.map((f) => (
            <FileChip
              key={f.id}
              name={f.file.name}
              size={f.file.size}
              mimeType={f.file.type}
              url={f.url}
              onRemove={() => removeFile(f.id)}
            />
          ))}
        </div>
      )}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--md-sys-color-outline-variant)]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1 font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors cursor-pointer"
          >
            <PaperclipIcon size={12} /> + 첨부
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT}
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] tabular-nums text-[var(--md-sys-color-outline)]">
            {body.length} / {MAX_BODY}
          </span>
          <Button
            size="sm"
            onClick={submit}
            disabled={!body.trim() && files.length === 0}
          >
            기록
          </Button>
        </div>
      </div>
    </div>
  );
}

const EMPTY_NOTES: BidNote[] = [];

function NoteTimeline({ bidId }: { bidId: string }) {
  // selector must return a stable reference; coalesce outside.
  const stored = useBidBoardStore((s) => s.notes[bidId]);
  const notes = stored ?? EMPTY_NOTES;
  const removeNote = useBidBoardStore((s) => s.removeNote);

  // Notes stored in creation order; serial = creation index. Display reversed.
  const display = useMemo(() => {
    return notes.map((note, i) => ({ note, serial: i + 1 })).reverse();
  }, [notes]);

  if (notes.length === 0) {
    return (
      <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)] mt-5 mb-2">
        — 아직 기록된 메모가 없습니다 —
      </p>
    );
  }

  return (
    <ol className="mt-5 space-y-5">
      {display.map(({ note, serial }) => (
        <li key={note.id} className="border-t border-[var(--md-sys-color-outline-variant)] pt-3">
          <div className="flex items-baseline justify-between gap-3 mb-2">
            <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
              {String(serial).padStart(2, '0')} —{' '}
              <span className="text-[var(--md-sys-color-on-surface-variant)]">
                {formatNoteTime(note.createdAt)} · {note.authorName}
              </span>
            </span>
            <button
              type="button"
              onClick={() => removeNote(bidId, note.id)}
              className="font-mono text-[9px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)] hover:text-[var(--md-sys-color-error)] transition-colors cursor-pointer"
              aria-label="삭제"
            >
              삭제
            </button>
          </div>
          {note.body && (
            <p className="text-[13px] leading-relaxed text-[var(--md-sys-color-on-surface)] whitespace-pre-wrap">
              {note.body}
            </p>
          )}
          {note.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {note.attachments.map((a) => (
                <NoteAttachment key={a.id} attachment={a} />
              ))}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

function NoteAttachment({ attachment }: { attachment: Attachment }) {
  const isImage = attachment.mimeType?.startsWith('image/');
  const [broken, setBroken] = useState(false);

  if (broken || !attachment.url) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 border border-dashed border-[var(--md-sys-color-outline-variant)] rounded-md font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--md-sys-color-outline)]">
        {attachment.name} · 미리보기 만료
      </span>
    );
  }

  if (isImage) {
    return (
      <a
        href={attachment.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-16 h-16 border border-[var(--md-sys-color-outline-variant)] rounded-md overflow-hidden bg-[var(--md-sys-color-surface-container-high)]"
        title={attachment.name}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attachment.url}
          alt={attachment.name}
          onError={() => setBroken(true)}
          className="w-full h-full object-cover"
        />
      </a>
    );
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 px-2 py-1 border border-[var(--md-sys-color-outline-variant)] rounded-md font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
    >
      <FileTextIcon size={11} /> {attachment.name}
    </a>
  );
}

function FileChip({
  name,
  size,
  mimeType,
  url,
  onRemove,
}: {
  name: string;
  size: number;
  mimeType: string;
  url: string;
  onRemove: () => void;
}) {
  const isImage = mimeType?.startsWith('image/');
  return (
    <span className="inline-flex items-center gap-2 px-2 py-1 bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] rounded-md">
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="w-5 h-5 object-cover rounded-md" />
      ) : (
        <FileTextIcon size={11} />
      )}
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--md-sys-color-on-surface-variant)] truncate max-w-[160px]">
        {name}
      </span>
      <span className="font-mono text-[9px] tabular-nums text-[var(--md-sys-color-outline)]">
        {(size / 1024).toFixed(0)}KB
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`${name} 제거`}
        className="text-[var(--md-sys-color-outline)] hover:text-[var(--md-sys-color-on-surface)] transition-colors cursor-pointer"
      >
        <XIcon size={11} />
      </button>
    </span>
  );
}

function formatNoteTime(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}
