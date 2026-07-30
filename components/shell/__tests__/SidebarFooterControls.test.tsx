import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SidebarFooterControls } from '../SidebarFooterControls';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

vi.mock('@/lib/stores/theme', () => ({
  useThemeStore: (selector: (s: { resolvedTheme: string; setTheme: () => void }) => unknown) =>
    selector({ resolvedTheme: 'light', setTheme: vi.fn() }),
}));

vi.mock('@/lib/hooks/usePlatform', () => ({
  useIsMac: () => false,
}));

vi.mock('@/lib/hooks/useIsMobile', () => ({
  useIsMobile: () => false,
}));

const mockChannelIO = vi.fn();

function renderControls() {
  return render(
    <SidebarProvider>
      <TooltipProvider delay={0}>
        <SidebarFooterControls />
      </TooltipProvider>
    </SidebarProvider>,
  );
}

describe('SidebarFooterControls — 문의하기 버튼', () => {
  beforeEach(() => {
    mockChannelIO.mockClear();
    window.ChannelIO = mockChannelIO as unknown as typeof window.ChannelIO;
  });

  it('renders 문의하기 button', () => {
    renderControls();
    expect(screen.getByRole('button', { name: '문의하기' })).toBeInTheDocument();
  });

  it('calls ChannelIO showMessenger when clicked', async () => {
    const user = userEvent.setup();
    renderControls();
    await user.click(screen.getByRole('button', { name: '문의하기' }));
    expect(mockChannelIO).toHaveBeenCalledWith('showMessenger');
  });
});

describe('SidebarFooterControls — 크롬 컨트롤 분리', () => {
  // 접기 토글은 헤더 좌측(Header)·모바일 상단 바(MobileShellBar)로 옮겼다.
  // 푸터에 남는 것은 지원 액션(문의하기)과 표시 설정(테마)뿐이다.
  it('does not render the sidebar collapse trigger', () => {
    renderControls();
    expect(screen.queryByRole('button', { name: '사이드바 접기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '사이드바 펼치기' })).not.toBeInTheDocument();
    expect(document.querySelector('[data-sidebar="trigger"]')).not.toBeInTheDocument();
  });

  it('keeps the theme toggle in the footer toolbar', () => {
    renderControls();
    const toolbar = document.querySelector('[data-testid="sidebar-footer-toolbar"]');
    expect(toolbar).toContainElement(screen.getByRole('button', { name: '다크 모드로 전환' }));
  });
});
