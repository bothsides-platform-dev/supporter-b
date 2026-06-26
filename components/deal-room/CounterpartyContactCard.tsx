import { Mail, Phone } from 'lucide-react';
import type { DealContact } from '@/lib/server/rfp-detail-loader';

/**
 * 선정 후 딜룸에 노출되는 상대 담당자 연락처 카드. 이메일은 항상, 전화는 값이
 * 있을 때만 행을 렌더한다(현재 카드 수수료처럼 노출은 서버 로더가 게이트).
 */
export function CounterpartyContactCard({
  title,
  contact,
}: {
  title: string;
  contact: DealContact;
}) {
  return (
    <section className="rounded-md border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] p-4">
      <h3 className="text-[13px] font-medium text-[var(--md-sys-color-on-surface)]">{title}</h3>
      <p className="mt-1 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
        {contact.workspaceName}
      </p>
      <p className="text-[14px] font-medium text-[var(--md-sys-color-on-surface)]">{contact.name}</p>
      <div className="mt-2 space-y-1">
        <a
          href={`mailto:${contact.email}`}
          className="flex w-fit items-center gap-2 text-[13px] text-[var(--md-sys-color-primary)] hover:underline"
        >
          <Mail size={14} aria-hidden />
          <span>{contact.email}</span>
        </a>
        {contact.phone && (
          <a
            href={`tel:${contact.phone}`}
            className="flex w-fit items-center gap-2 text-[13px] text-[var(--md-sys-color-primary)] hover:underline"
          >
            <Phone size={14} aria-hidden />
            <span className="md-numeric">{contact.phone}</span>
          </a>
        )}
      </div>
    </section>
  );
}
