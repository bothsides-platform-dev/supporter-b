'use client';

import { useCallback, useRef, useState } from 'react';
import { useInView } from 'motion/react';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { MobileShellBar } from '@/components/shell/MobileShellBar';
import { DemoNavProvider, hrefToDemoPage } from '@/lib/nav/demo-nav-context';
import { demoWorkspaceName } from '@/components/landing/demo-fixtures';
import { DemoSidebar } from './DemoSidebar';
import { DemoCursor } from './DemoCursor';
import { demoTriggerSelector, demoCursorHint } from './demo-triggers';
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
  const inView = useInView(rootRef, { once: true, amount: 0.3 });
  const [page, setPage] = useState(1);

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
      const anchor = (e.target as HTMLElement).closest('a[href]');
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
            창 경계를 넘어가도 잘리지 않고 데모 섹션 밖으로 보이게 한다. */}
        <div className="relative">
          <div
            ref={rootRef}
            onClickCapture={onClickCapture}
            className="demo-app-window relative h-[600px] overflow-hidden rounded-xl border border-[var(--md-sys-color-outline-variant)] [transform:translateZ(0)]"
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
          </div>
          {inView && (
            <DemoCursor
              windowRef={rootRef}
              selector={demoTriggerSelector(page)}
              page={page}
              hint={demoCursorHint(page)}
            />
          )}
        </div>
      </div>
    </DemoNavProvider>
  );
}
