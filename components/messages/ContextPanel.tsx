'use client';

import { Chip } from '@/components/primitives/Chip';
import type { ChipColor } from '@/components/primitives/Chip';
import { AttachmentGalleryPanel } from './AttachmentGalleryPanel';

type RfpContext = {
  code: string;
  title: string;
  status?: string;
  deadline?: string | null;
};

type Props = {
  conversationId: string;
  rfpContext?: RfpContext;
};

const STATUS_LABEL: Record<string, string> = {
  draft: '임시저장',
  sent: '요청 보냄',
  closed: '마감',
  awarded: '선정 완료',
  cancelled: '취소',
};

const STATUS_COLOR: Record<string, ChipColor> = {
  draft: 'surface',
  sent: 'warning',
  closed: 'surface',
  awarded: 'tertiary',
  cancelled: 'error',
};

export function ContextPanel({ conversationId, rfpContext }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {rfpContext && (
        <section className="border-b border-[var(--md-sys-color-outline-variant)] p-3">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-[var(--md-sys-color-on-surface-variant)]">
            연결된 RFP
          </p>
          <div className="rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] p-2.5">
            <p className="md-numeric text-[11px] text-[var(--md-sys-color-primary)]">
              {rfpContext.code}
            </p>
            <p className="mt-1 text-[13px] font-medium text-[var(--md-sys-color-on-surface)]">
              {rfpContext.title}
            </p>
            {rfpContext.status && (
              <div className="mt-2">
                <Chip
                  label={STATUS_LABEL[rfpContext.status] ?? rfpContext.status}
                  color={STATUS_COLOR[rfpContext.status] ?? 'surface'}
                />
              </div>
            )}
            {rfpContext.deadline && (
              <p className="mt-1.5 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                마감{' '}
                <span className="md-numeric">
                  {new Date(rfpContext.deadline).toLocaleDateString('ko-KR', {
                    month: 'long',
                    day: 'numeric',
                  })}
                </span>
              </p>
            )}
          </div>
        </section>
      )}
      <section className="flex-1 p-3">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-[var(--md-sys-color-on-surface-variant)]">
          공유 파일
        </p>
        <AttachmentGalleryPanel conversationId={conversationId} />
      </section>
    </div>
  );
}
