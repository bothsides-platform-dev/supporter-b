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

vi.mock('@/lib/hooks/useIsMobile', () => ({
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
import { SidebarSubItem } from '../sidebar/SidebarSubItem';

// Mirrors NavItem.test harness: SidebarSubItem reads useSidebar for expanded/
// mobile state, so it renders under a SidebarProvider.
function renderItem(ui: React.ReactElement, { open = true }: { open?: boolean } = {}) {
  return render(
    <SidebarProvider defaultOpen={open}>
      <TooltipProvider delay={0}>{ui}</TooltipProvider>
    </SidebarProvider>,
  );
}

afterEach(() => cleanup());

describe('SidebarSubItem', () => {
  it('renders a link to its href with its label', () => {
    renderItem(<SidebarSubItem href="/rfp?status=draft" label="작성중" />);
    const link = screen.getByRole('link', { name: '작성중' });
    expect(link).toHaveAttribute('href', '/rfp?status=draft');
  });

  it('sets aria-current="page" when active', () => {
    renderItem(<SidebarSubItem href="/rfp?status=draft" label="작성중" active />);
    expect(screen.getByRole('link', { name: '작성중' })).toHaveAttribute('aria-current', 'page');
  });

  it('does not set aria-current when inactive', () => {
    renderItem(<SidebarSubItem href="/rfp?status=draft" label="작성중" />);
    expect(screen.getByRole('link', { name: '작성중' })).not.toHaveAttribute('aria-current');
  });

  it('reveals the chord shortcut in a tooltip on hover when expanded', async () => {
    const user = userEvent.setup();
    renderItem(
      <SidebarSubItem
        href="/rfp?status=draft"
        label="작성중"
        shortcut={{ kind: 'chord', lead: 'g', key: '1' }}
      />,
      { open: true },
    );
    const link = screen.getByRole('link', { name: '작성중' });
    expect(link.querySelector('[data-slot="kbd"]')).not.toBeInTheDocument();
    await user.hover(link);
    expect(await screen.findByText('G')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
