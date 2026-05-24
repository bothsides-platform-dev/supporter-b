import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ShellSidebarTrigger } from '../ShellSidebarTrigger';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

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

  it('shows a tooltip with the expand label when the sidebar is collapsed', async () => {
    const user = userEvent.setup();
    renderTrigger(false);
    await user.hover(screen.getByRole('button', { name: '사이드바 펼치기' }));
    expect(await screen.findByText('사이드바 펼치기')).toBeInTheDocument();
  });
});
