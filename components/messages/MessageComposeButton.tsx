'use client';

import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { WorkspaceAvatar } from '@/components/primitives/WorkspaceAvatar';
import { ComposeIcon, PaperclipIcon } from '@/components/icons';
import { ComingSoonDialog } from './ComingSoonDialog';
import { RecipientCard } from './RecipientCard';
import type { Counterparty, RfpContext } from './types';

type Props = {
  counterparty: Counterparty;
  rfpContext?: RfpContext;
  /**
   * 진입점 표시 형태(인터랙션은 동일 — 클릭 시 '채팅보내기' 메뉴 → 컴포즈 Sheet):
   * 'avatar' = 아바타만(헤더·섹션 등), 'profile' = 아바타+상대명(표 행 등 이름 노출 필요).
   */
  variant?: 'avatar' | 'profile';
};

const LABEL = '메시지 보내기';

/**
 * 사업자 프로필 진입점 — 프로필(아바타) 클릭 시 '채팅보내기' 메뉴를 열고,
 * 선택하면 우측 컴포즈 Sheet를 연다. Sheet의 '채팅보내기'는 백엔드 미구현이라
 * '구현중' 모달로 귀결(렌더 전용). 모든 진입점이 이 컴포넌트로 통일됨.
 */
export function MessageComposeButton({ counterparty, rfpContext, variant = 'avatar' }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [comingSoonOpen, setComingSoonOpen] = useState(false);
  const [draft, setDraft] = useState('');

  function handleSend() {
    // 백엔드 미구현 — 전송 대신 '구현중' 모달.
    setComingSoonOpen(true);
  }

  const triggerClass =
    variant === 'profile'
      ? 'group/msg inline-flex items-center gap-2 text-left outline-none rounded-[var(--md-sys-shape-extra-small)] focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50'
      : 'inline-flex rounded-[var(--md-sys-shape-extra-small)] outline-none transition-shadow hover:ring-2 hover:ring-[var(--md-sys-color-outline-variant)] focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button type="button" aria-label={`${counterparty.name} 프로필`} className={triggerClass} />
          }
        >
          <WorkspaceAvatar
            name={counterparty.name}
            size={variant === 'profile' ? 'sm' : 'md'}
            workspaceId={counterparty.workspaceId}
            hasLogo={counterparty.hasLogo}
          />
          {variant === 'profile' && (
            <span className="font-medium text-[13px] text-[var(--md-sys-color-on-surface)] group-hover/msg:text-[var(--md-sys-color-primary)] group-hover/msg:underline">
              {counterparty.name}
            </span>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-[140px]">
          <DropdownMenuItem onClick={() => setSheetOpen(true)}>
            <ComposeIcon size={14} />
            채팅보내기
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{LABEL}</SheetTitle>
            <SheetDescription>{counterparty.name}에게 메시지를 보냅니다.</SheetDescription>
          </SheetHeader>

          <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4">
            <RecipientCard counterparty={counterparty} rfpContext={rfpContext} />

            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="메시지를 입력하세요…"
              rows={6}
              className="w-full resize-none rounded-[var(--md-sys-shape-medium)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-3 py-2.5 text-[13px] text-[var(--md-sys-color-on-surface)] outline-none placeholder:text-[var(--md-sys-color-on-surface-variant)] focus-visible:border-[var(--md-sys-color-primary)]"
            />

            <button
              type="button"
              disabled
              aria-disabled="true"
              className="inline-flex w-fit items-center gap-1.5 rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] px-2.5 py-1.5 text-[12px] text-[var(--md-sys-color-on-surface-variant)] opacity-60"
            >
              <PaperclipIcon size={14} />
              파일 첨부
            </button>
          </div>

          <div className="flex justify-end gap-2 border-t border-[var(--md-sys-color-outline-variant)] p-4">
            <Button variant="ghost" size="sm" onClick={() => setSheetOpen(false)}>
              취소
            </Button>
            <Button size="sm" onClick={handleSend}>
              채팅보내기
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <ComingSoonDialog open={comingSoonOpen} onOpenChange={setComingSoonOpen} />
    </>
  );
}
