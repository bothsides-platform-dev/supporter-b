'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useInView } from 'motion/react';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { MobileShellBar } from '@/components/shell/MobileShellBar';
import { DemoNavProvider, hrefToDemoPage } from '@/lib/nav/demo-nav-context';
import { useDemoStepAutoplay } from '@/components/landing/useDemoStepAutoplay';
import { demoWorkspaceName } from '@/components/landing/demo-fixtures';
import { DemoSidebar } from './DemoSidebar';
import { DemoCursor } from './DemoCursor';
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
export function DemoAppShell({
  controlledStep,
  onStepSelect,
  scrollLocked,
}: {
  controlledStep?: number;
  onStepSelect?: (n: number) => void;
  scrollLocked?: boolean;
} = {}) {
  const controlled = controlledStep != null;
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, { once: true, amount: 0.3 });
  const [userInteracted, setUserInteracted] = useState(false);

  // controlled(스크롤 구동)면 내부 타이머 자동재생을 끈다.
  const tour = useDemoStepAutoplay(TOTAL_PAGES, PAGE_AUTO_MS, !controlled && inView && !userInteracted);
  // controlledStep은 number | undefined — ?? 로 좁혀 page를 항상 number로 유지(TS narrowing).
  const page = controlledStep ?? tour.step;

  const freeze = useCallback(() => setUserInteracted(true), []);

  const goToPage = useCallback(
    (n: number) => {
      if (controlled) {
        // 클릭 = "그 스텝으로 스크롤" — 실제 페이지 전환은 스크롤이 되돌려준다.
        onStepSelect?.(n);
        return;
      }
      setUserInteracted(true);
      tour.setStep(n);
    },
    [controlled, onStepSelect, tour],
  );

  const navigate = useCallback(
    (href: string) => {
      const target = hrefToDemoPage(href);
      if (target) goToPage(target);
    },
    [goToPage],
  );

  const autoplaying = !controlled && inView && !userInteracted && page < TOTAL_PAGES;
  const guiding = !controlled && inView && !userInteracted;

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
                className={`min-h-0 min-w-0 flex-1 ${scrollLocked ? 'overflow-hidden' : 'overflow-y-auto'}`}
              >
                {page === 1 && <HomePageHost showCue={guiding} />}
                {page === 2 && <RfpListPageHost onOpenRfp={() => goToPage(3)} showCue={guiding} />}
                {page === 3 && <DealRoomPageHost showCue={guiding} />}
                {page === 4 && <WizardPageHost enabled={guiding} showCue={guiding} />}
              </div>
            </SidebarInset>
          </SidebarProvider>
          {controlled && (
            <DemoCursor windowRef={rootRef} selector={demoTriggerSelector(page)} page={page} />
          )}
        </div>
      </div>
    </DemoNavProvider>
  );
}
