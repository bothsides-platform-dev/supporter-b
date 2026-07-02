'use client';

import { useCallback, useRef, useState } from 'react';
import { useInView } from 'motion/react';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileShellBar } from '@/components/shell/MobileShellBar';
import { DemoNavProvider, hrefToDemoPage } from '@/lib/nav/demo-nav-context';
import { demoWorkspaceName } from '@/components/landing/demo-fixtures';
import { DemoSidebar } from './DemoSidebar';
import { DemoCursor } from './DemoCursor';
import { demoTriggerSelector, demoCursorHint } from './demo-triggers';
import { useBlockSidebarShortcut } from './use-block-sidebar-shortcut';
import { HomePageHost } from './pages/HomePageHost';
import { RfpListPageHost } from './pages/RfpListPageHost';
import { DealRoomPageHost } from './pages/DealRoomPageHost';
import { WizardPageHost } from './pages/WizardPageHost';

const PAGE_PATH: Record<number, string> = {
  1: '/home',
  2: '/rfp',
  3: '/rfp/P-2606-0042',
  4: '/rfp-create',
};

// SidebarProvider 인라인 스타일이 ui/sidebar의 h-dvh/min-h-svh를 이겨 프레임 안에 가둔다.
const sidebarStyle = {
  '--sidebar-width': 'var(--shell-sidebar)',
  '--sidebar-width-icon': '3rem',
  height: '100%',
  minHeight: 0,
} as React.CSSProperties;

// 랜딩 임베디드 데모 — 실제 사이드바 + 4개 실제 페이지를 인플레이스로 순회한다.
// 스크롤 구동·자동재생 없이, 각 화면에서 가이드 커서가 '여기를 누르면 다음 화면'을 가리키고
// 방문자가 그 대상을 클릭하면 다음 화면으로 넘어간다. 사이드바/콘텐츠 내부 링크 클릭은
// 캡처 단계에서 가로채 페이지를 전환하므로 URL이 바뀌거나 랜딩을 이탈하지 않는다.
export function DemoAppShell() {
  const rootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, { once: true, amount: 0.3 });
  const isMobile = useIsMobile();
  const [page, setPage] = useState(1);
  useBlockSidebarShortcut();

  const goToPage = useCallback((n: number) => setPage(n), []);

  const navigate = useCallback(
    (href: string) => {
      const target = hrefToDemoPage(href);
      if (target) goToPage(target);
    },
    [goToPage],
  );

  const onClickCapture = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      // 모바일 헤더의 사이드바 토글(ShellSidebarTrigger)은 body에 포탈되는 실제 Sheet를
      // 열어 스케일된 데모 창 밖으로 전체화면 오버레이가 튀어나온다 — 캡처 단계에서 눌러 무시.
      if (target.closest('[data-sidebar="trigger"]')) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const anchor = target.closest('a[href]');
      if (!anchor) return;
      const href = anchor.getAttribute('href') ?? '';
      if (!href.startsWith('/')) return;
      // 캡처 단계에서 막아 Next <Link>의 onClick(router.push)까지 차단한다.
      e.preventDefault();
      e.stopPropagation();
      navigate(href);
    },
    [navigate],
  );

  return (
    <DemoNavProvider value={{ pathname: PAGE_PATH[page], search: '', navigate }}>
      <div className="flex flex-col gap-3">
        {/* relative 래퍼(overflow-hidden 아님) — 커서를 데모 창 밖에 두어, 힌트·스크롤 안내가
            창 경계를 넘어가도 잘리지 않고 데모 섹션 밖으로 보이게 한다.
            containerRef = 커서의 offset parent(scale 없음) → 커서 좌표 계산 기준. */}
        <div ref={containerRef} className="relative">
          {/* 스크롤로 데모가 뷰포트에 들어오면 100%→110%로 살짝 확대(랜딩 진입 스케일 —
              DESIGN.md §9③ 예외). 모바일은 가로 크롭을 피하려 확대하지 않는다.
              translateZ(0)는 컴포지팅 레이어 승격용으로 스케일과 함께 유지. */}
          <div
            ref={rootRef}
            onClickCapture={onClickCapture}
            style={{
              transform: `translateZ(0) scale(${inView && !isMobile ? 1.1 : 1})`,
              transition: 'transform 700ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
            className="demo-app-window relative h-[600px] overflow-hidden rounded-xl border border-[var(--md-sys-color-outline-variant)]"
          >
            <SidebarProvider style={sidebarStyle}>
              <DemoSidebar workspaceName={demoWorkspaceName} />
              <SidebarInset className="flex min-w-0 flex-1 flex-col bg-[var(--shell-chrome-bg)]">
                <MobileShellBar workspaceName={demoWorkspaceName} />
                <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
                  {page === 1 && <HomePageHost />}
                  {page === 2 && <RfpListPageHost onOpenRfp={() => goToPage(3)} />}
                  {page === 3 && <DealRoomPageHost />}
                  {page === 4 && <WizardPageHost enabled={false} />}
                </div>
              </SidebarInset>
            </SidebarProvider>

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
          {inView && (
            <DemoCursor
              windowRef={rootRef}
              containerRef={containerRef}
              selector={demoTriggerSelector(page, isMobile)}
              page={page}
              hint={demoCursorHint(page)}
            />
          )}
        </div>
      </div>
    </DemoNavProvider>
  );
}
