'use client';

import { useRef } from 'react';
import { Label } from '@/components/primitives/Label';
import { underlineInputClass } from '@/components/forms/inputs';
import { cn } from '@/lib/utils';
import { NEW_TAB_NOTICE } from '@/lib/a11y/link-notice';

export type ProposalState =
  | { id: string; name: string; size: number }
  | { name: string; status: 'uploading' }
  | { name: string; status: 'error'; error: string }
  | null;

type Props = {
  proposal: ProposalState;
  previousProposal?: { id: string; name: string };
  proposalChoice?: 'keep' | 'replace' | 'remove';
  onProposalChoice?: (choice: 'keep' | 'replace' | 'remove') => void;
  memo: string;
  onUpload: (file: File) => void;
  onClear: () => void;
  onMemoChange: (value: string) => void;
};

export function BidStepProposal({
  proposal,
  previousProposal,
  proposalChoice,
  onProposalChoice,
  memo,
  onUpload,
  onClear,
  onMemoChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const proposalReady = proposal && 'id' in proposal;

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label size="md" muted={false}>견적서 PDF (선택)</Label>
          {previousProposal && (
            <fieldset className="space-y-2 rounded-[6px] border border-[var(--md-sys-color-outline-variant)] p-3 text-[14px]">
              <legend className="md-label-medium">이전 견적서</legend>
              {([
                ['keep', '기존 견적서 유지'],
                ['replace', '새 견적서로 교체'],
                ['remove', '견적서 제거'],
              ] as const).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2">
                  <input type="radio" name="proposal-choice" checked={proposalChoice === value}
                    onChange={() => onProposalChoice?.(value)} />
                  {label}
                </label>
              ))}
              {proposalChoice === 'keep' && <a href={`/api/files/${previousProposal.id}`} target="_blank" rel="noreferrer" className="underline underline-offset-2">{previousProposal.name}<span className="sr-only">{NEW_TAB_NOTICE}</span></a>}
            </fieldset>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              e.target.value = '';
            }}
          />
          {!proposal && (!previousProposal || proposalChoice === 'replace') && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="block w-full border border-dashed border-[var(--md-sys-color-outline)] py-5 text-center hover:border-[var(--md-sys-color-on-surface)] transition-colors"
            >
              {/* 지시문(주 톤·라벨 라지) / 힌트(보조 톤·라벨 스몰) 2단 —
                  같은 톤·크기로 붙으면 위계가 사라진다(DESIGN.md §2). */}
              <p className="md-label-large text-[var(--md-sys-color-on-surface)]">
                PDF 업로드 (클릭)
              </p>
              <p className="md-label-small text-[var(--md-sys-color-on-surface-variant)] mt-1">
                20MB 이내
              </p>
            </button>
          )}
          {(!previousProposal || proposalChoice === 'replace') && proposal && 'status' in proposal && proposal.status === 'uploading' && (
            <p className="md-label-small text-[var(--md-sys-color-on-surface-variant)]">
              {proposal.name} — UPLOADING…
            </p>
          )}
          {(!previousProposal || proposalChoice === 'replace') && proposal && 'status' in proposal && proposal.status === 'error' && (
            <div className="flex items-center justify-between gap-3">
              <p className="md-label-small text-[var(--md-sys-color-error)]">
                {proposal.name} — {proposal.error}
              </p>
              <button
                type="button"
                onClick={onClear}
                className="md-label-small text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-error)] px-1"
              >
                ×
              </button>
            </div>
          )}
          {(!previousProposal || proposalChoice === 'replace') && proposalReady && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-[var(--md-sys-color-on-surface)] truncate">{proposal.name}</span>
                <button
                  type="button"
                  onClick={onClear}
                  className="md-label-small text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-error)] px-1 shrink-0"
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

    </div>
  );
}
