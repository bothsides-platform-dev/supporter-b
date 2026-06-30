'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useInView } from 'motion/react';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { MobileShellBar } from '@/components/shell/MobileShellBar';
import { DemoNavProvider, hrefToPgDemoPage, isInertPgDemoNavHref } from '@/lib/nav/demo-nav-context';
import { useDemoStepAutoplay } from '@/components/landing/useDemoStepAutoplay';
import { DemoSidebar } from './DemoSidebar';
import { DemoStepBar } from './DemoStepBar';
import { PgHomePageHost } from './pg/PgHomePageHost';
import { PgInboxPageHost } from './pg/PgInboxPageHost';
import { PgDealRoomPageHost } from './pg/PgDealRoomPageHost';
import { PgMessagesPageHost } from './pg/PgMessagesPageHost';
import { demoPgWorkspaceName } from './pg/pg-demo-fixtures';

const TOTAL_PAGES = 4;
const PAGE_AUTO_MS = 4800;
const FLASH_MS = 650;
const STEP_LABELS = ['홈', '받은 요청', '견적 작성', '메시지'] as const;

const PAGE_PATH: Record<number, string> = {
  1: '/home',
  2: '/inbox',
  3: '/inbox/P-2606-0042',
  4: '/messages',
};

// 자동 전환 직전 하이라이트할 트리거 셀렉터(없으면 생략).
const PAGE_TRIGGER: Record<number, string> = {
  1: 'a[href="/inbox/P-2606-0042"]',
  2: 'tbody tr',
  3: '',
  4: '',
};

const sidebarStyle = {
  '--sidebar-width': 'var(--shell-sidebar)',
  '--sidebar-width-icon': '3rem',
  height: '100%',
  minHeight: 0,
} as React.CSSProperties;

// PG 파트너 랜딩 임베디드 데모 — 실제 사이드바 + 실제 페이지(홈·받은요청·딜룸·메시지)를
// 인플레이스로 순회한다. 구매사 DemoAppShell과 동일한 자동투어·클릭 인터셉트·하이라이트
// 메커니즘. 견적 제출은 게스트 모드라 가입(/signup/pg)으로 연결된다.
export function PgDemoAppShell() {
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, { once: true, amount: 0.3 });
  const [userInteracted, setUserInteracted] = useState(false);

  const tour = useDemoStepAutoplay(TOTAL_PAGES, PAGE_AUTO_MS, inView && !userInteracted);
  const page = tour.step;

  const goToPage = useCallback(
    (n: number) => {
      setUserInteracted(true);
      tour.setStep(n);
    },
    [tour],
  );

  const navigate = useCallback(
    (href: string) => {
      const target = hrefToPgDemoPage(href);
      if (target) goToPage(target);
    },
    [goToPage],
  );

  const autoplaying = inView && !userInteracted && page < TOTAL_PAGES;
  const guiding = inView && !userInteracted;

  const replay = useCallback(() => {
    setUserInteracted(false);
    tour.setStep(1);
  }, [tour]);

  // 전환 직전, 다음 단계로 넘기는 실제 요소에 잠깐 클릭 하이라이트(구매사 데모와 동일).
  useEffect(() => {
    const win = rootRef.current;
    if (!autoplaying || !win) return;
    const selector = PAGE_TRIGGER[page];
    if (!selector) return;
    let flashed: Element | null = null;
    const id = setTimeout(() => {
      flashed = win.querySelector(selector);
      flashed?.classList.add('demo-click-flash');
    }, PAGE_AUTO_MS - FLASH_MS);
    return () => {
      clearTimeout(id);
      flashed?.classList.remove('demo-click-flash');
    };
  }, [page, autoplaying]);

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
              <div
                onPointerDownCapture={() => setUserInteracted(true)}
                onKeyDownCapture={() => setUserInteracted(true)}
                className="min-h-0 min-w-0 flex-1 overflow-y-auto"
              >
                {page === 1 && <PgHomePageHost showCue={guiding} />}
                {page === 2 && <PgInboxPageHost onOpenRfp={() => goToPage(3)} showCue={guiding} />}
                {page === 3 && (
                  <PgDealRoomPageHost
                    onGuestSubmit={() => window.location.assign('/signup/pg')}
                    showCue={guiding}
                  />
                )}
                {page === 4 && <PgMessagesPageHost showCue={guiding} />}
              </div>
            </SidebarInset>
          </SidebarProvider>
        </div>
        <DemoStepBar
          current={page}
          autoplaying={autoplaying}
          intervalMs={PAGE_AUTO_MS}
          onSelect={goToPage}
          onReplay={replay}
          labels={STEP_LABELS}
        />
      </div>
    </DemoNavProvider>
  );
}
