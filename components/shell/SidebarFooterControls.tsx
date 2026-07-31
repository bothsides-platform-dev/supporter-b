'use client';

import { MessageCircle } from 'lucide-react';
import { SunIcon, MoonIcon } from '@/components/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useSidebar } from '@/components/ui/sidebar';
import { useThemeToggle } from '@/components/shell/use-theme-toggle';
import { cn } from '@/lib/utils';

type SidebarFooterControlsProps = {
  className?: string;
};

// 푸터의 두 행이 공유하는 문법. 아이콘은 좌측 끝(px-2.5 로 nav 아이콘 열에 선다),
// 라벨은 우측 끝(justify-between). 위쪽 nav 는 아이콘+라벨이 붙어 있어 푸터만
// 문법이 다르지만, 푸터는 구분선 아래 지원 액션·표시 설정이라 구분되는 편이
// 낫다는 판단(사용자 결정).
//
// hover/focus/cursor 는 nav 행(`sidebar/NavItem.tsx` 의 navItemBase)·`IconButton`
// 과 같은 값을 쓴다 — 이 행들은 raw <button> 이라 디자인 시스템 기본값을 상속받지
// 못하고, 빠뜨리면 셸에서 이 두 행만 커서가 화살표이고 hover 가 뚝 끊긴다.
// gap-2.5 는 justify-between 아래에서 보통 놀지만 라벨이 길어졌을 때의 최소
// 간격 바닥으로 남겨둔다.
// 접힘(48px)에서는 라벨을 숨기고 아이콘만 가운데 세운다 — 이름은 툴팁이 잇는다.
const FOOTER_ROW_CLASS = cn(
  'flex h-8 w-full cursor-pointer items-center justify-between gap-2.5',
  'rounded-[var(--md-sys-shape-small)] px-2.5',
  'text-[var(--md-sys-color-on-surface-variant)]',
  'transition-colors duration-[var(--md-sys-motion-duration-short-4)]',
  'hover:bg-[var(--md-sys-color-surface-container)] hover:text-[var(--md-sys-color-on-surface)]',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50',
  'group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0',
);

const FOOTER_ROW_LABEL_CLASS = cn(
  'text-[length:var(--md-typescale-label-large-size)]',
  'group-data-[collapsible=icon]:hidden',
);

export function SidebarFooterControls({ className }: SidebarFooterControlsProps) {
  const { isDark, label: themeLabel, toggleFrom } = useThemeToggle();
  const { state, isMobile } = useSidebar();

  // 펼침 상태에서는 라벨이 20px 옆에 이미 보이므로 툴팁이 같은 말을 반복한다.
  // nav 행과 같은 규칙(`NavItem` 의 showTooltip)으로 접힘일 때만 띄운다.
  const showTooltip = state === 'collapsed' && !isMobile;

  const contactButton = (
    <button
      type="button"
      // 접히면 라벨 span 이 display:none 이라 접근 가능한 이름에서 빠진다 —
      // aria-label 이 있어야 48px 레일에서도 이름이 남는다.
      aria-label="문의하기"
      onClick={() => window.ChannelIO?.('showMessenger')}
      className={FOOTER_ROW_CLASS}
    >
      <MessageCircle size={18} aria-hidden="true" className="shrink-0" />
      <span className={FOOTER_ROW_LABEL_CLASS}>문의하기</span>
    </button>
  );

  const themeButton = (
    <button
      type="button"
      aria-label={themeLabel}
      onClick={(e) => toggleFrom(e.currentTarget)}
      className={FOOTER_ROW_CLASS}
    >
      {isDark ? (
        <SunIcon size={18} aria-hidden="true" className="shrink-0" />
      ) : (
        <MoonIcon size={18} aria-hidden="true" className="shrink-0" />
      )}
      <span className={FOOTER_ROW_LABEL_CLASS}>{themeLabel}</span>
    </button>
  );

  return (
    <div
      data-testid="sidebar-footer-toolbar"
      className={cn('flex w-full flex-col gap-1', className)}
    >
      <Tooltip disabled={!showTooltip}>
        <TooltipTrigger disabled={!showTooltip} render={contactButton} />
        {showTooltip ? (
          <TooltipContent side="right" sideOffset={8}>
            문의하기
          </TooltipContent>
        ) : null}
      </Tooltip>

      <Tooltip disabled={!showTooltip}>
        <TooltipTrigger disabled={!showTooltip} render={themeButton} />
        {showTooltip ? (
          <TooltipContent side="right" sideOffset={8}>
            {themeLabel}
          </TooltipContent>
        ) : null}
      </Tooltip>
    </div>
  );
}
