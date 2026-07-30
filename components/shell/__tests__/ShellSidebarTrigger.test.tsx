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
});
