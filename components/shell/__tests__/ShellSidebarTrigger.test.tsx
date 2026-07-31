import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ShellSidebarTrigger } from '../ShellSidebarTrigger';

function stubUserAgent(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', {
    configurable: true,
    value: ua,
  });
}

afterEach(() => {
  delete (window.navigator as unknown as Record<string, unknown>).userAgent;
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

let mockIsMobile = false;
vi.mock('@/lib/hooks/useIsMobile', () => ({
  useIsMobile: () => mockIsMobile,
}));

afterEach(() => {
  mockIsMobile = false;
});

const sidebarProviderStyle = {
  '--sidebar-width': 'var(--shell-sidebar)',
  '--sidebar-width-icon': '3rem',
} as React.CSSProperties;

function renderTrigger(defaultOpen: boolean) {
  return render(
    <SidebarProvider defaultOpen={defaultOpen} style={sidebarProviderStyle}>
      <TooltipProvider delay={0}>
        <ShellSidebarTrigger />
      </TooltipProvider>
    </SidebarProvider>,
  );
}

describe('ShellSidebarTrigger', () => {
  it('exposes collapse label via aria-label when expanded', () => {
    renderTrigger(true);
    expect(screen.getByRole('button', { name: '사이드바 접기' })).toBeInTheDocument();
  });

  it('exposes expand label via aria-label when collapsed', () => {
    renderTrigger(false);
    expect(screen.getByRole('button', { name: '사이드바 펼치기' })).toBeInTheDocument();
  });

  // 트리거가 사는 곳은 가로 상단 바 두 곳(Header, MobileShellBar)뿐이다 —
  // 어느 쪽도 텍스트 라벨을 싣지 않으므로 상태·뷰포트와 무관하게 아이콘 전용이다.
  it.each([
    ['expanded desktop', true, false],
    ['collapsed desktop', false, false],
    ['expanded mobile', true, true],
  ])('renders no visible text label (%s)', (_name, open, mobile) => {
    mockIsMobile = mobile;
    renderTrigger(open);
    expect(screen.queryByText('사이드바 접기')).not.toBeInTheDocument();
    expect(screen.queryByText('사이드바 펼치기')).not.toBeInTheDocument();
  });

  it('renders a square icon-only button', () => {
    renderTrigger(true);
    const trigger = screen.getByRole('button', { name: '사이드바 접기' });
    expect(trigger.className).toMatch(/\bsize-8\b/);
    expect(trigger.className).toMatch(/\bjustify-center\b/);
  });

  // 헤더에서 오른쪽은 브레드크럼과 충돌한다 — 아래로 띄운다.
  it('anchors the tooltip below the trigger', async () => {
    const user = userEvent.setup();
    renderTrigger(true);
    await user.hover(screen.getByRole('button', { name: '사이드바 접기' }));
    const tooltip = document.querySelector('[data-slot="tooltip-content"]');
    expect(tooltip).toHaveAttribute('data-side', 'bottom');
  });

  it('shows a tooltip with the expand label when the sidebar is collapsed', async () => {
    const user = userEvent.setup();
    renderTrigger(false);
    await user.hover(screen.getByRole('button', { name: '사이드바 펼치기' }));
    expect(await screen.findByText('사이드바 펼치기')).toBeInTheDocument();
  });

  it('does not show tooltip on keyboard focus when collapsed', () => {
    renderTrigger(false);
    fireEvent.focus(screen.getByRole('button', { name: '사이드바 펼치기' }));
    expect(document.querySelector('[data-slot="tooltip-content"]')).not.toBeInTheDocument();
  });

  it('does not show tooltip on focus when expanded', () => {
    renderTrigger(true);
    fireEvent.focus(screen.getByRole('button', { name: '사이드바 접기' }));
    expect(document.querySelector('[data-slot="tooltip-content"]')).not.toBeInTheDocument();
  });

  it('does not show inline shortcut keycaps when expanded', () => {
    stubUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    renderTrigger(true);
    expect(screen.queryByText('Ctrl')).not.toBeInTheDocument();
    expect(screen.queryByText('B')).not.toBeInTheDocument();
  });

  it('shows the toggle shortcut in the tooltip when expanded', async () => {
    stubUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    const user = userEvent.setup();
    renderTrigger(true);
    await user.hover(screen.getByRole('button', { name: '사이드바 접기' }));
    const tooltip = document.querySelector('[data-slot="tooltip-content"]');
    expect(tooltip).toHaveTextContent('사이드바 접기');
    expect(tooltip).toHaveTextContent('Ctrl');
    expect(tooltip).toHaveTextContent('B');
  });

  it('shows ⌘ and B in the tooltip when expanded on Mac', async () => {
    stubUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
    const user = userEvent.setup();
    renderTrigger(true);
    await user.hover(screen.getByRole('button', { name: '사이드바 접기' }));
    const tooltip = document.querySelector('[data-slot="tooltip-content"]');
    expect(tooltip).toHaveTextContent('⌘');
    expect(tooltip).toHaveTextContent('B');
  });

  it('shows the toggle shortcut in the tooltip when collapsed', async () => {
    stubUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    const user = userEvent.setup();
    renderTrigger(false);
    await user.hover(screen.getByRole('button', { name: '사이드바 펼치기' }));
    const tooltip = document.querySelector('[data-slot="tooltip-content"]');
    expect(tooltip).toHaveTextContent('사이드바 펼치기');
    expect(tooltip).toHaveTextContent('Ctrl');
    expect(tooltip).toHaveTextContent('B');
  });

  // 랜딩 데모의 클릭 차단막이 이 셀렉터에 의존한다 — 이름을 바꾸면 조용히 끊긴다.
  it('keeps the data-sidebar="trigger" hook', () => {
    renderTrigger(true);
    expect(screen.getByRole('button', { name: '사이드바 접기' })).toHaveAttribute(
      'data-sidebar',
      'trigger',
    );
  });
});

// 회귀: 모바일은 데스크톱의 `open` 이 아니라 별도의 `openMobile` 로 시트를 연다
// (components/ui/sidebar.tsx). `state` 는 데스크톱 값에서만 파생하므로, 그걸로
// 라벨을 정하면 모바일에서 시트가 닫혀 있는데도 "접기"라고 읽힌다.
describe('ShellSidebarTrigger — 모바일 시트 상태', () => {
  it('시트가 닫혀 있으면 펼치기로 안내한다', () => {
    mockIsMobile = true;
    renderTrigger(true); // 데스크톱 기본값은 펼침 — 모바일 라벨이 여기 끌려가면 안 된다
    expect(screen.getByRole('button', { name: '사이드바 펼치기' })).toBeInTheDocument();
  });

  it('시트를 열면 접기로 바뀐다', async () => {
    mockIsMobile = true;
    const user = userEvent.setup();
    renderTrigger(true);
    await user.click(screen.getByRole('button', { name: '사이드바 펼치기' }));
    expect(screen.getByRole('button', { name: '사이드바 접기' })).toBeInTheDocument();
  });
});

describe('ShellSidebarTrigger — 정본(shadcn) 정합', () => {
  // buttonVariants 를 거쳐야 앱 공통 포커스 링을 받는다. raw <button> 이면
  // 브라우저 기본 outline 이 떠서 같은 헤더의 다른 버튼과 어긋난다.
  it('shares the design-system focus ring', () => {
    renderTrigger(true);
    expect(screen.getByRole('button').className).toMatch(/focus-visible:ring-ring/);
  });

  // hover 는 ghost 변형이 준다 — 손으로 다시 칠하지 않는다.
  it('keeps the ghost hover affordance', () => {
    renderTrigger(true);
    expect(screen.getByRole('button').className).toMatch(/hover:bg-muted/);
  });

  // 회귀(브라우저 실측): `aria-expanded` 를 붙이면 ghost 가 그걸 "팝업 열림"으로
  // 읽어 `bg-muted` 를 상시로 칠한다. 펼침이 기본이라 버튼이 늘 눌린 것처럼 보이고,
  // hover 색이 같은 토큰이라 hover 피드백까지 사라진다. 붙이지 않는 게 정본이다.
  it.each([
    ['expanded', true],
    ['collapsed', false],
  ])('does not take the ghost pressed-fill via aria-expanded (%s)', (_name, open) => {
    renderTrigger(open);
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-expanded');
  });

  // PanelLeft 를 180° 돌리면 PanelRight(우측 사이드바) 그림이 된다 — 뜻이 뒤집힌다.
  // 정본은 회전시키지 않는다. 다음 동작을 가리키는 아이콘으로 교체한다.
  it.each([
    ['expanded', true, 'lucide-panel-left-close'],
    ['collapsed', false, 'lucide-panel-left-open'],
  ])('swaps the icon instead of rotating it (%s)', (_name, open, iconClass) => {
    const { container } = renderTrigger(open);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toContain(iconClass);
    expect(svg?.getAttribute('class')).not.toContain('rotate-180');
  });
});
