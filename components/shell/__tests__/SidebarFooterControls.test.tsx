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

vi.mock('@/hooks/use-mobile', () => ({
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
