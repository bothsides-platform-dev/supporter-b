import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// base-ui tooltip positioner reads ResizeObserver; jsdom lacks it.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

vi.mock('@/lib/hooks/usePlatform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/hooks/usePlatform')>()),
  useIsMac: () => false,
}));

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { NavItem } from '../sidebar/NavItem';
import { HomeIcon } from '@/components/icons';

// NavItem reads the sidebar context (useSidebar) for collapsed/icon state, so it
// must render under a SidebarProvider — same harness as SidebarSection.test.
function renderItem(ui: React.ReactElement) {
  return render(
    <SidebarProvider>
      <TooltipProvider delay={0}>{ui}</TooltipProvider>
    </SidebarProvider>,
  );
}

afterEach(() => cleanup());

describe('NavItem', () => {
  it('renders a link to its href with its label', () => {
    renderItem(<NavItem href="/home" label="홈" icon={HomeIcon} />);
    const link = screen.getByRole('link', { name: /홈/ });
    expect(link).toHaveAttribute('href', '/home');
  });

  it('sets aria-current="page" when active', () => {
    renderItem(<NavItem href="/home" label="홈" icon={HomeIcon} active />);
    expect(screen.getByRole('link', { name: /홈/ })).toHaveAttribute('aria-current', 'page');
  });

  it('does not set aria-current when inactive', () => {
    renderItem(<NavItem href="/home" label="홈" icon={HomeIcon} />);
    expect(screen.getByRole('link', { name: /홈/ })).not.toHaveAttribute('aria-current');
  });

  it('renders a provided badge inside the link', () => {
    renderItem(
      <NavItem
        href="/notifications"
        label="알림"
        badge={<span data-testid="unread-badge">3</span>}
      />,
    );
    const link = screen.getByRole('link', { name: /알림/ });
    expect(link).toContainElement(screen.getByTestId('unread-badge'));
  });

  it('reveals the keyboard shortcut in a tooltip on hover', async () => {
    const user = userEvent.setup();
    renderItem(
      <NavItem
        href="/home"
        label="홈"
        icon={HomeIcon}
        shortcut={{ kind: 'chord', lead: 'g', key: 'h' }}
      />,
    );
    await user.hover(screen.getByRole('link', { name: /홈/ }));
    expect(await screen.findByText('H')).toBeInTheDocument();
  });
});
