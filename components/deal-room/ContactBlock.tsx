'use client';

import { Mail, Phone } from 'lucide-react';
import type { DealContact } from '@/lib/server/rfp-detail-loader';
import { CopyButton } from './CopyButton';

export function ContactBlock({
  contact,
  counterpartyKind,
}: {
  contact: DealContact;
  counterpartyKind: 'buyer' | 'pg';
}) {
  const kindLabel = counterpartyKind === 'buyer' ? '구매사' : 'PG';
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[var(--md-sys-color-tertiary-container)] text-[14px] font-semibold text-[var(--md-sys-color-on-tertiary-container)]">
          {contact.name.slice(0, 1)}
        </span>
        <div>
          <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-[var(--md-sys-color-on-surface)]">
            {contact.name}
            <span className="rounded-[6px] bg-[var(--md-sys-color-secondary-container)] px-2 py-0.5 text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)]">
              {kindLabel} · {contact.workspaceName}
            </span>
          </p>
          <p className="text-[12px] text-[var(--md-sys-color-on-surface-variant)]">담당자</p>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <div className="flex items-center gap-2.5 text-[13px]">
          <Mail size={15} className="flex-none text-[var(--md-sys-color-on-surface-variant)]" aria-hidden />
          <a href={`mailto:${contact.email}`} className="text-[var(--md-sys-color-primary)] hover:underline">
            {contact.email}
          </a>
          <CopyButton value={contact.email} label="이메일" />
        </div>
        {contact.phone && (
          <div className="flex items-center gap-2.5 text-[13px]">
            <Phone size={15} className="flex-none text-[var(--md-sys-color-on-surface-variant)]" aria-hidden />
            <a href={`tel:${contact.phone}`} className="md-numeric text-[var(--md-sys-color-primary)] hover:underline">
              {contact.phone}
            </a>
            <CopyButton value={contact.phone} label="전화" />
          </div>
        )}
      </div>
    </div>
  );
}
