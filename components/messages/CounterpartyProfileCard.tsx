'use client';

import { useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import { cn } from '@/lib/utils';
import { WorkspaceAvatar } from '@/components/primitives/WorkspaceAvatar';
import { Chip } from '@/components/primitives/Chip';
import { ComposeIcon } from '@/components/icons';
import { MessageComposeSheet } from './MessageComposeSheet';
import { COUNTERPARTY_TYPE_LABEL, type Counterparty, type RfpContext } from './types';

type Props = {
  counterparty: Counterparty;
  rfpContext?: RfpContext;
  /**
   * 트리거 표시 형태: 'avatar' = 아바타만(헤더·섹션 등), 'profile' = 아바타+상대명(표 행 등).
   */
  variant?: 'avatar' | 'profile';
};

const LABEL = '메시지 보내기';

/**
 * 거래 상대(워크스페이스) 프로필 카드 — 아바타/이름 클릭 시 신원 카드(아바타+상대명+타입 칩)를
 * 팝오버로 띄우고, 그 안의 '메시지 보내기' 버튼으로 작성 드로어(MessageComposeSheet)를 연다.
 * 메시지 버튼은 workspaceId가 있을 때만 노출(없으면 신원만 표시). ACL은 서버에서 한 번 더 강제됨.
 * 거래 상대가 노출되는 모든 화면의 단일 진입점.
 */
export function CounterpartyProfileCard({ counterparty, rfpContext, variant = 'avatar' }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const canMessage = Boolean(counterparty.workspaceId);

  const triggerClass =
    variant === 'profile'
      ? 'group/msg inline-flex items-center gap-2 text-left outline-none rounded-[var(--md-sys-shape-extra-small)] focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50'
      : 'inline-flex rounded-[var(--md-sys-shape-extra-small)] outline-none transition-shadow hover:ring-2 hover:ring-[var(--md-sys-color-outline-variant)] focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50';

  return (
    <>
      <Popover.Root>
        <Popover.Trigger
          type="button"
          aria-label={`${counterparty.name} 프로필`}
          className={triggerClass}
          onClick={(e) => e.stopPropagation()}
        >
          <WorkspaceAvatar
            name={counterparty.name}
            size={variant === 'profile' ? 'sm' : 'md'}
            workspaceId={counterparty.workspaceId}
            logoUpdatedAt={counterparty.logoUpdatedAt}
          />
          {variant === 'profile' && (
            <span className="font-medium text-[13px] text-[var(--md-sys-color-on-surface)] group-hover/msg:text-[var(--md-sys-color-primary)] group-hover/msg:underline">
              {counterparty.name}
            </span>
          )}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner side="bottom" align="start" sideOffset={6} className="isolate z-50">
            <Popover.Popup
              className={cn(
                'z-50 w-[240px] origin-(--transform-origin) rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] p-3 shadow-md',
                'data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
              )}
            >
              <div className="flex items-center gap-3">
                <WorkspaceAvatar
                  name={counterparty.name}
                  size="md"
                  workspaceId={counterparty.workspaceId}
                  logoUpdatedAt={counterparty.logoUpdatedAt}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-[var(--md-sys-color-on-surface)]">
                    {counterparty.name}
                  </p>
                  <span className="mt-0.5 inline-flex">
                    <Chip label={COUNTERPARTY_TYPE_LABEL[counterparty.type]} color="surface" />
                  </span>
                </div>
              </div>

              {canMessage && (
                <button
                  type="button"
                  onClick={() => setSheetOpen(true)}
                  className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--md-sys-color-on-surface)] outline-none transition-colors hover:bg-[var(--md-sys-color-surface-container-high)] focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50"
                >
                  <ComposeIcon size={14} />
                  {LABEL}
                </button>
              )}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>

      {canMessage && (
        <MessageComposeSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          counterparty={counterparty}
          rfpContext={rfpContext}
        />
      )}
    </>
  );
}
