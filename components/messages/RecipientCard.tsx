import { WorkspaceAvatar } from '@/components/primitives/WorkspaceAvatar';
import { Chip } from '@/components/primitives/Chip';
import { COUNTERPARTY_TYPE_LABEL, type Counterparty, type RfpContext } from './types';

type Props = {
  counterparty: Counterparty;
  rfpContext?: RfpContext;
};

/**
 * 받는사람 미니카드 — 컴포즈 패널 / 스레드 헤더 공용.
 * 상대 워크스페이스 아바타 + 이름 + 타입 Chip, 그리고 RFP 컨텍스트.
 */
export function RecipientCard({ counterparty, rfpContext }: Props) {
  return (
    <div className="flex items-center gap-3 rounded-[var(--md-sys-shape-medium)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] px-3 py-2.5">
      <WorkspaceAvatar
        name={counterparty.name}
        size="md"
        workspaceId={counterparty.workspaceId}
        logoUpdatedAt={counterparty.logoUpdatedAt}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium text-[var(--md-sys-color-on-surface)]">
            {counterparty.name}
          </span>
          <Chip label={COUNTERPARTY_TYPE_LABEL[counterparty.type]} color="surface" />
        </div>
        {rfpContext && (rfpContext.code || rfpContext.title) && (
          <p className="mt-0.5 truncate text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
            {rfpContext.code && (
              <span className="md-numeric">{rfpContext.code}</span>
            )}
            {rfpContext.code && rfpContext.title && ' · '}
            {rfpContext.title}
          </p>
        )}
      </div>
    </div>
  );
}
