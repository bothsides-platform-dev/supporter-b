'use client';

import { useRef } from 'react';
import { Label } from '@/components/primitives/Label';
import { Button } from '@/components/primitives/Button';
import { underlineInputClass } from '@/components/forms/inputs';
import { cn } from '@/lib/utils';

export type ProposalState =
  | { id: string; name: string; size: number }
  | { name: string; status: 'uploading' }
  | { name: string; status: 'error'; error: string }
  | null;

type Props = {
  proposal: ProposalState;
  memo: string;
  onUpload: (file: File) => void;
  onClear: () => void;
  onMemoChange: (value: string) => void;
  onBack: () => void;
  onNext: () => void;
};

export function BidStepProposal({
  proposal,
  memo,
  onUpload,
  onClear,
  onMemoChange,
  onBack,
  onNext,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const proposalReady = proposal && 'id' in proposal;

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label size="md" muted={false}>견적서 PDF (선택)</Label>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              e.target.value = '';
            }}
          />
          {!proposal && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="block w-full border border-dashed border-[var(--md-sys-color-outline)] py-5 text-center hover:border-[var(--md-sys-color-on-surface)] transition-colors"
            >
              <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
                PDF 업로드 (클릭)
              </p>
              <p className="font-mono text-[10px] tracking-[0.08em] uppercase text-[var(--md-sys-color-outline)] mt-1">
                20MB 이내
              </p>
            </button>
          )}
          {proposal && 'status' in proposal && proposal.status === 'uploading' && (
            <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--md-sys-color-outline)]">
              {proposal.name} — UPLOADING…
            </p>
          )}
          {proposal && 'status' in proposal && proposal.status === 'error' && (
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--md-sys-color-error)]">
                {proposal.name} — {proposal.error}
              </p>
              <button
                type="button"
                onClick={onClear}
                className="font-mono text-[11px] text-[var(--md-sys-color-outline)] hover:text-[var(--md-sys-color-error)] px-1"
              >
                ×
              </button>
            </div>
          )}
          {proposalReady && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-[var(--md-sys-color-on-surface)] truncate">{proposal.name}</span>
                <button
                  type="button"
                  onClick={onClear}
                  className="font-mono text-[11px] text-[var(--md-sys-color-outline)] hover:text-[var(--md-sys-color-error)] px-1 shrink-0"
                >
                  ×
                </button>
              </div>
              <iframe
                src={`/api/files/${proposal.id}`}
                title={proposal.name}
                className="w-full h-[320px] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)]"
              />
            </div>
          )}
        </div>
        <div className="space-y-1">
          <Label size="md" muted={false}>메모</Label>
          <textarea
            value={memo}
            onChange={(e) => onMemoChange(e.target.value)}
            rows={3}
            placeholder="추가 안내 사항이 있으면 입력하세요."
            className={cn(underlineInputClass, 'resize-none')}
          />
        </div>
      </div>

      <div className="flex justify-between">
        <Button type="button" variant="text" onClick={onBack} icon={<span aria-hidden>←</span>}>
          수수료
        </Button>
        <Button type="button" onClick={onNext} trailingIcon={<span aria-hidden>→</span>}>
          검토·발송
        </Button>
      </div>
    </div>
  );
}
