'use client';

import { useCallback, useRef, useState } from 'react';
import { useInView } from 'motion/react';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { MobileShellBar } from '@/components/shell/MobileShellBar';
import { DemoNavProvider, hrefToPgDemoPage, isInertPgDemoNavHref } from '@/lib/nav/demo-nav-context';
import { DemoSidebar } from './DemoSidebar';
import { DemoCursor } from './DemoCursor';
import { PgHomePageHost } from './pg/PgHomePageHost';
import { PgInboxPageHost } from './pg/PgInboxPageHost';
import { PgDealRoomPageHost } from './pg/PgDealRoomPageHost';
import { PgMessagesPageHost } from './pg/PgMessagesPageHost';
import { demoPgWorkspaceName } from './pg/pg-demo-fixtures';

const PAGE_PATH: Record<number, string> = {
  1: '/home',
  2: '/inbox',
  3: '/inbox/P-2606-0042',
  4: '/messages',
};

// 각 화면에서 가이드 커서가 가리키는 대상. 1~3은 클릭 시 다음 화면으로 진행하는 실제 요소
// (사이드바 항목·목록 행). 4(메시지)는 진짜 종착이라 다음은 없지만, 커서는 전송 버튼을 가리킨다.
const PAGE_TRIGGER: Record<number, string> = {
  1: 'a[href="/inbox"]', // 사이드바 '받은 견적 요청' → 인박스
  2: 'tbody tr', // 받은 요청 첫 행 → 딜룸
  3: 'a[href="/messages"]', // 사이드바 '메시지' → 메시지
  4: '[data-demo-cursor]', // 메시지 전송 버튼(종착 — 커서만 얹음)
};

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
export function PgDemoAppShell() {
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, { once: true, amount: 0.3 });
  const [page, setPage] = useState(1);

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

  return (
    <DemoNavProvider value={{ pathname: PAGE_PATH[page], search: '', navigate }}>
      <div className="flex flex-col gap-3">
        <div
          ref={rootRef}
          onClickCapture={onClickCapture}
          className="demo-app-window relative h-[600px] overflow-hidden rounded-xl border border-[var(--md-sys-color-outline-variant)] [transform:translateZ(0)]"
        >
          <SidebarProvider style={sidebarStyle}>
            <DemoSidebar
              workspaceName={demoPgWorkspaceName}
              workspaceType="pg"
              isInert={isInertPgDemoNavHref}
            />
            <SidebarInset className="flex min-w-0 flex-1 flex-col bg-[var(--shell-chrome-bg)]">
              <MobileShellBar workspaceName={demoPgWorkspaceName} />
              <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
                {page === 1 && <PgHomePageHost showCue={inView} />}
                {page === 2 && <PgInboxPageHost onOpenRfp={() => goToPage(3)} showCue={inView} />}
                {page === 3 && (
                  <PgDealRoomPageHost
                    onGuestSubmit={() => window.location.assign('/signup/pg')}
                    showCue={inView}
                  />
                )}
                {page === 4 && <PgMessagesPageHost showCue={inView} />}
              </div>
            </SidebarInset>
          </SidebarProvider>
          {inView && (
            <DemoCursor windowRef={rootRef} selector={PAGE_TRIGGER[page] || null} page={page} />
          )}
        </div>
      </div>
    </DemoNavProvider>
  );
}
