'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useInView } from 'motion/react';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { MobileShellBar } from '@/components/shell/MobileShellBar';
import { DemoNavProvider, hrefToDemoPage } from '@/lib/nav/demo-nav-context';
import { useDemoStepAutoplay } from '@/components/landing/useDemoStepAutoplay';
import { demoWorkspaceName } from '@/components/landing/demo-fixtures';
import { DemoSidebar } from './DemoSidebar';
import { DemoStepBar } from './DemoStepBar';
import { demoTriggerSelector } from './demo-triggers';
import { HomePageHost } from './pages/HomePageHost';
import { RfpListPageHost } from './pages/RfpListPageHost';
import { DealRoomPageHost } from './pages/DealRoomPageHost';
import { WizardPageHost } from './pages/WizardPageHost';

const TOTAL_PAGES = 4;
const PAGE_AUTO_MS = 4500;
// 전환 직전, 트리거 요소에 클릭 하이라이트를 비추는 시간. globals.css의 demo-click-flash와 일치.
const FLASH_MS = 650;
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
// 뷰에 들어오면 자동 투어로 페이지를 넘기다, 방문자가 한 번이라도 조작하면 멈추고
// 제어권을 넘긴다. 사이드바/콘텐츠 내부 링크 클릭은 캡처 단계에서 가로채 페이지를
// 전환하므로 URL이 바뀌거나 랜딩을 이탈하지 않는다.
export function DemoAppShell() {
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, { once: true, amount: 0.3 });
  const [userInteracted, setUserInteracted] = useState(false);

  const tour = useDemoStepAutoplay(TOTAL_PAGES, PAGE_AUTO_MS, inView && !userInteracted);
  const page = tour.step;

  const freeze = useCallback(() => setUserInteracted(true), []);

  const goToPage = useCallback(
    (n: number) => {
      setUserInteracted(true);
      tour.setStep(n);
    },
    [tour],
  );

  const navigate = useCallback(
    (href: string) => {
      const target = hrefToDemoPage(href);
      // 데모에 없는 라우트(알림/메시지/설정/상태 필터)는 무시 — 페이지 유지·투어 유지.
      if (target) goToPage(target);
    },
    [goToPage],
  );

  const autoplaying = inView && !userInteracted && page < TOTAL_PAGES;
  // 코치마크는 마지막 단계에서도 보여야 하므로 page<TOTAL 게이트를 두지 않는다.
  const guiding = inView && !userInteracted;
  const replay = useCallback(() => {
    setUserInteracted(false);
    tour.setStep(1);
  }, [tour]);

  // 자동 전환 직전, 다음 단계로 넘어가게 만드는 실제 요소(사이드바 항목·목록 행)에 잠깐
  // 클릭 하이라이트를 입혀 "이걸 누르면 넘어가요"를 보여준다. 전환되면 정리에서 다시 뗀다.
  useEffect(() => {
    const win = rootRef.current;
    if (!autoplaying || !win) return;
    const selector = demoTriggerSelector(page);
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
        <div
          ref={rootRef}
          onClickCapture={onClickCapture}
          className="demo-app-window relative h-[600px] overflow-hidden rounded-xl border border-[var(--md-sys-color-outline-variant)] [transform:translateZ(0)]"
        >
          <SidebarProvider style={sidebarStyle}>
            <DemoSidebar workspaceName={demoWorkspaceName} />
            <SidebarInset className="flex min-w-0 flex-1 flex-col bg-[var(--shell-chrome-bg)]">
              <MobileShellBar workspaceName={demoWorkspaceName} />
              <div
                onPointerDownCapture={freeze}
                onKeyDownCapture={freeze}
                className="min-h-0 min-w-0 flex-1 overflow-y-auto"
              >
                {page === 1 && <HomePageHost showCue={guiding} />}
                {page === 2 && <RfpListPageHost onOpenRfp={() => goToPage(3)} showCue={guiding} />}
                {page === 3 && <DealRoomPageHost showCue={guiding} />}
                {page === 4 && <WizardPageHost enabled={guiding} showCue={guiding} />}
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
        />
      </div>
    </DemoNavProvider>
  );
}
