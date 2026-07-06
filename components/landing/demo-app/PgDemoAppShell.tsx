'use client';

import { useCallback, useRef, useState } from 'react';
import { useInView } from 'motion/react';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileShellBar } from '@/components/shell/MobileShellBar';
import { DemoNavProvider, hrefToPgDemoPage, isInertPgDemoNavHref } from '@/lib/nav/demo-nav-context';
import { PgProcessStepRail, type ProcessStep } from '@/components/landing/PgProcessStepRail';
import { DemoSidebar } from './DemoSidebar';
import { DemoCursor } from './DemoCursor';
import { useCappedEntryScale } from './use-capped-entry-scale';
import { useDemoFitScale } from './use-demo-fit-scale';
import {
  pgDemoTriggerSelector,
  pgDemoCursorHint,
  pgDemoShowsGuideCursor,
  DEMO_WINDOW_TRANSITION,
} from './demo-triggers';
import { PgHomePageHost } from './pg/PgHomePageHost';
import { PgInboxPageHost } from './pg/PgInboxPageHost';
import { PgDealRoomPageHost } from './pg/PgDealRoomPageHost';
import { PgMessagesPageHost } from './pg/PgMessagesPageHost';
import { demoPgWorkspaceName } from './pg/pg-demo-fixtures';
import { useBlockSidebarShortcut, blockSidebarTriggerClick } from './use-block-sidebar-shortcut';

const PAGE_PATH: Record<number, string> = {
  1: '/home',
  2: '/inbox',
  3: '/inbox/P-2606-0042',
  4: '/messages',
};

// 데스크톱 데모는 이 고정 폭 캔버스에 그린 뒤 창 폭에 맞게 축소한다(useDemoFitScale). 창이
// 화면보다 좁은 768~1080px 구간에서 6컬럼 테이블 등이 짓눌려 줄바꿈되던 문제를 없앤다.
// 1080 은 랜딩 컨테이너(max-w-1080)와 동일 — 넓은 화면(box=1080)에선 배율 1(무변경),
// 좁은 화면에선 이 캔버스를 그대로 축소해 레이아웃을 보존한다. 폰(<768)은 모바일 레이아웃.
const DESKTOP_CANVAS_W = 1080;

const sidebarStyle = {
  '--sidebar-width': 'var(--shell-sidebar)',
  '--sidebar-width-icon': '3rem',
  height: '100%',
  minHeight: 0,
} as React.CSSProperties;

// PG 파트너 랜딩 임베디드 데모 — 실제 사이드바 + 실제 페이지(홈·받은요청·딜룸·메시지)를
// 인플레이스로 순회한다. 스크롤 구동·자동재생 없이, 각 화면에서 가이드 커서가 다음으로
// 넘어갈 클릭 대상을 가리키고 방문자가 클릭하면 진행한다. 견적 제출은 게스트 모드라
// 가입(/signup/pg)으로 연결된다.
export function PgDemoAppShell({ steps }: { steps?: readonly ProcessStep[] } = {}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, { once: true, amount: 0.3 });
  const isMobile = useIsMobile();
  const maxScale = useCappedEntryScale(rootRef, 1.1);
  const fitScale = useDemoFitScale(rootRef, DESKTOP_CANVAS_W);
  const [page, setPage] = useState(1);
  useBlockSidebarShortcut();

  const goToPage = useCallback((n: number) => setPage(n), []);

  const navigate = useCallback(
    (href: string) => {
      const target = hrefToPgDemoPage(href);
      if (target) goToPage(target);
    },
    [goToPage],
  );

  const onClickCapture = useCallback(
    (e: React.MouseEvent) => {
      if (blockSidebarTriggerClick(e)) return;
      const anchor = (e.target as HTMLElement).closest('a[href]');
      if (!anchor) return;
      const href = anchor.getAttribute('href') ?? '';
      if (!href.startsWith('/')) return;
      e.preventDefault();
      e.stopPropagation();
      navigate(href);
    },
    [navigate],
  );

  // 사이드바 + 실제 페이지 — 데스크톱은 고정 캔버스에 그려 축소하고, 모바일은 자연 폭으로
  // 그린다(둘 다 동일 콘텐츠). 고정 캔버스라 좁은 창에서도 데스크톱 레이아웃이 줄바꿈되지 않는다.
  const appContent = (
    <SidebarProvider style={sidebarStyle}>
      <DemoSidebar
        workspaceName={demoPgWorkspaceName}
        workspaceType="pg"
        isInert={isInertPgDemoNavHref}
      />
      <SidebarInset className="flex min-w-0 flex-1 flex-col bg-[var(--shell-chrome-bg)]">
        <MobileShellBar workspaceName={demoPgWorkspaceName} />
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          {page === 1 && <PgHomePageHost />}
          {page === 2 && <PgInboxPageHost onOpenRfp={() => goToPage(3)} />}
          {page === 3 && (
            <PgDealRoomPageHost onGuestSubmit={() => window.location.assign('/signup/pg')} />
          )}
          {page === 4 && <PgMessagesPageHost />}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );

  return (
    <DemoNavProvider value={{ pathname: PAGE_PATH[page], search: '', navigate }}>
      <div className="flex flex-col gap-[var(--s-6)]">
        {/* 창 위 참여 프로세스 스테퍼 — 현재 데모 페이지(page)에 맞춰 활성 스텝·상세를 싱크한다.
            steps 미지정 시(단위 테스트 등) 렌더하지 않는다. */}
        {steps && <PgProcessStepRail steps={steps} page={page} />}
        {/* relative 래퍼(overflow-hidden 아님) — 커서를 데모 창 밖에 두어, 힌트·스크롤 안내가
            창 경계를 넘어가도 잘리지 않고 데모 섹션 밖으로 보이게 한다.
            containerRef = 커서의 offset parent(scale 없음) → 커서 좌표 계산 기준. */}
        <div ref={containerRef} className="relative">
          {/* 스크롤로 데모가 뷰포트에 들어오면 100%→110%로 살짝 확대(랜딩 진입 스케일 —
              DESIGN.md §9③ 예외). 단, 확대된 너비가 현재 window 너비를 넘지 않도록
              useCappedEntryScale로 상한을 둔다. 모바일은 가로 크롭을 피하려 확대하지 않는다.
              translateZ(0)는 컴포지팅 레이어 승격용으로 스케일과 함께 유지. */}
          <div
            ref={rootRef}
            onClickCapture={onClickCapture}
            style={{
              transform: `translateZ(0) scale(${inView && !isMobile ? maxScale : 1})`,
              transition: DEMO_WINDOW_TRANSITION,
            }}
            className="demo-app-window relative h-[600px] overflow-hidden rounded-xl border border-[var(--md-sys-color-outline-variant)]"
          >
            {isMobile ? (
              appContent
            ) : (
              // 데스크톱 고정 캔버스(1080) — 창보다 좁으면 fitScale 로 축소해 줄바꿈을 막는다.
              // height = 600/fitScale 이라 축소 후 시각 높이가 정확히 창(600px)을 채운다.
              // origin-top-left 로 좌상단 고정, 창 overflow-hidden 이 나머지를 클립.
              <div
                className="absolute left-0 top-0 origin-top-left"
                style={{
                  width: DESKTOP_CANVAS_W,
                  height: `${600 / fitScale}px`,
                  transform: `scale(${fitScale})`,
                }}
              >
                {appContent}
              </div>
            )}

            {/* 모바일 진행 어포던스 — 사이드바(1·3 단계)가 off-canvas Sheet로 접혀 못 누르므로,
                창 안에 '다음 화면' 버튼을 두어 커서가 이를 가리키고 방문자가 눌러 진행한다.
                onClickCapture는 앵커만 가로채므로 이 버튼과 무간섭. */}
            {isMobile && (page === 1 || page === 3) && (
              <button
                type="button"
                data-demo-mobile-next
                onClick={() => goToPage(page + 1)}
                className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-[var(--md-sys-shape-small)] bg-[var(--md-sys-color-primary)] px-4 py-2 text-[13px] font-medium text-[var(--md-sys-color-on-primary)] shadow-lg"
              >
                다음 화면 보기 →
              </button>
            )}
          </div>
          {inView && pgDemoShowsGuideCursor(page) && (
            <DemoCursor
              windowRef={rootRef}
              containerRef={containerRef}
              selector={pgDemoTriggerSelector(page, isMobile)}
              page={page}
              hint={pgDemoCursorHint(page)}
            />
          )}
        </div>
      </div>
    </DemoNavProvider>
  );
}
