'use client';

import { PanelLeftCloseIcon, PanelLeftOpenIcon } from 'lucide-react';
import { ModifierShortcut } from '@/components/primitives/ModifierShortcut';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useSidebar } from '@/components/ui/sidebar';
import { SIDEBAR_TOGGLE_KEY } from '@/lib/shell/sidebar-cookie';
import { useIsMac } from '@/lib/hooks/usePlatform';
import { cn } from '@/lib/utils';

type ShellSidebarTriggerProps = {
  className?: string;
};

/** 셸 툴팁 공통 지연. Sidebar.tsx 의 `<TooltipProvider delay={300}>` 과 같은 값. */
const SHELL_TOOLTIP_DELAY_MS = 300;

export function ShellSidebarTrigger({ className }: ShellSidebarTriggerProps) {
  const { state, isMobile, openMobile, toggleSidebar } = useSidebar();
  const isMac = useIsMac();
  // 모바일은 데스크톱의 `open` 이 아니라 `openMobile` 이 시트를 연다
  // (components/ui/sidebar.tsx). `state` 는 데스크톱 값에서만 파생하므로 여기서
  // 갈라주지 않으면 시트가 닫혀 있어도 라벨이 "접기"로 읽힌다.
  //
  // 대가로 모바일 첫 페인트에 한 프레임짜리 뒤집힘이 있다: `useIsMobile` 의
  // 서버 스냅샷이 false 라 SSR 은 데스크톱 분기(=쿠키 값)로 그렸다가 하이드레이션
  // 뒤 `openMobile`(닫힘)로 바뀐다. 그래도 이 편이 낫다 — 예전엔 안 흔들리는 대신
  // 라벨이 항상 틀렸다. 하이드레이션 후 값은 아래 '모바일 시트 상태' 테스트가 못박는다.
  const isExpanded = isMobile ? openMobile : state === 'expanded';
  const label = isExpanded ? '사이드바 접기' : '사이드바 펼치기';
  const showTooltip = !isMobile;
  // 회전이 아니라 교체한다 — PanelLeft 를 180° 돌리면 PanelRight(우측 사이드바)
  // 그림이 되어 뜻이 뒤집힌다. 화살표가 "다음 동작"을 가리켜 라벨과 맞는다.
  const Icon = isExpanded ? PanelLeftCloseIcon : PanelLeftOpenIcon;

  const button = (
    <Button
      variant="ghost"
      size="icon"
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      aria-label={label}
      onClick={toggleSidebar}
      // 상태는 aria-label 플립으로만 알린다. `aria-expanded` 를 붙이면 Button 의
      // ghost 변형이 그걸 "팝업 열림" 표시로 읽어 `bg-muted` 를 상시로 칠하는데,
      // 펼침이 기본이라 버튼이 늘 눌린 것처럼 보이고 hover 색이 그 값과 같아
      // hover 피드백까지 사라진다. 되돌리려 `aria-expanded:bg-transparent` 를 얹으면
      // Tailwind 가 aria-* 를 hover 뒤에 정렬해 이번엔 hover 가 죽는다.
      // 정본 shadcn 도 aria-expanded 를 붙이지 않는다.
      className={cn('text-[var(--md-sys-color-on-surface-variant)]', className)}
    >
      <Icon className="size-[18px]" aria-hidden="true" />
    </Button>
  );

  // Tooltip 은 항상 감싼다 — 상태가 뒤집혀도 버튼이 언마운트되지 않아야 포커스가
  // 유지되고 ⌘B·Enter 연타가 이어진다.
  //
  // delay 는 명시해야 한다. 트리거가 사이드바에 살 때는 Sidebar.tsx 의
  // `<TooltipProvider delay={300}>` 안이었는데, 헤더로 나오면서 프로바이더 밖이 됐다
  // — 그대로 두면 base-ui 기본값 600ms 로 늘어나 셸에서 가장 느린 툴팁이 된다.
  // 하필 ⌘B 를 알려주는 툴팁이라 단축키 발견성이 그만큼 깎인다.
  return (
    <Tooltip disabled={!showTooltip}>
      <TooltipTrigger
        disabled={!showTooltip}
        delay={SHELL_TOOLTIP_DELAY_MS}
        render={button}
      />
      {showTooltip ? (
        <TooltipContent side="bottom" sideOffset={8} className="gap-2">
          <span>{label}</span>
          <ModifierShortcut shortcutKey={SIDEBAR_TOGGLE_KEY.toUpperCase()} isMac={isMac} />
        </TooltipContent>
      ) : null}
    </Tooltip>
  );
}
