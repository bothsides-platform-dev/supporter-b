'use client';

import { MessageCircle } from 'lucide-react';
import { SunIcon, MoonIcon } from '@/components/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useThemeToggle } from '@/components/shell/use-theme-toggle';
import { cn } from '@/lib/utils';

type SidebarFooterControlsProps = {
  className?: string;
};

// 푸터의 두 행은 같은 문법을 공유한다: 아이콘은 좌측 끝(px-2.5 로 nav 아이콘
// 열에 선다), 라벨은 우측 끝으로 밀어 행 폭을 꽉 채운다(justify-between).
// 위쪽 nav 는 아이콘+라벨이 붙어 있어 푸터만 문법이 다르지만, 푸터는 지원
// 액션·표시 설정이라 nav 와 구분되는 편이 낫다는 판단(사용자 결정).
// 접힘(48px)에서는 라벨을 숨기고 아이콘만 가운데 세운다 — 이름은 툴팁이 잇는다.
const FOOTER_ROW_CLASS =
  'flex h-8 w-full items-center justify-between gap-2.5 rounded-[var(--md-sys-shape-small)] px-2.5 ' +
  'text-[var(--md-sys-color-on-surface-variant)] ' +
  'hover:bg-[var(--md-sys-color-surface-container)] hover:text-[var(--md-sys-color-on-surface)] ' +
  'group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 ' +
  'group-data-[collapsible=icon]:px-0';

const FOOTER_ROW_LABEL_CLASS =
  'text-[length:var(--md-typescale-label-large-size)] group-data-[collapsible=icon]:hidden';

export function SidebarFooterControls({ className }: SidebarFooterControlsProps) {
  const { isDark, label: themeLabel, toggleFrom } = useThemeToggle();

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
      <Tooltip>
        <TooltipTrigger render={contactButton} />
        <TooltipContent side="right" sideOffset={8}>
          문의하기
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger render={themeButton} />
        <TooltipContent side="right" sideOffset={8}>
          {themeLabel}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
