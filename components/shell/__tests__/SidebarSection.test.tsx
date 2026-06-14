import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

const mockPathname = vi.fn(() => '/rfp');
const mockSearchParams = vi.fn(() => new URLSearchParams(''));
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
  useSearchParams: () => mockSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/hooks/usePlatform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/hooks/usePlatform')>()),
  useIsMac: () => false,
}));

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

import { SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SidebarSection } from '../sidebar/SidebarSection';
import { useSidebarSectionsStore } from '@/lib/stores/sidebar-sections';
import { getNavConfig } from '@/lib/nav/nav-config';
import type { NavSection } from '@/lib/nav/nav-config';

const rfpSection: NavSection = {
  id: 'rfp',
  label: 'RFP',
  href: '/rfp',
  base: '/rfp',
  links: [{ id: 'rfp-new', label: '새 RFP', href: '/rfp-create' }],
  statuses: [
    { status: 'active', label: '진행중' },
    { status: 'closed', label: '마감' },
    { status: 'awarded', label: '계약완료' },
  ],
};
const settingsSection = getNavConfig('buyer').sections.find((s) => s.id === 'settings')!;

function renderSection(section: typeof rfpSection) {
  return render(
    <SidebarProvider>
      <SidebarSection section={section} />
    </SidebarProvider>,
  );
}

beforeEach(() => {
  mockPathname.mockReturnValue('/rfp');
  mockSearchParams.mockReturnValue(new URLSearchParams(''));
  useSidebarSectionsStore.setState({ collapsed: {} });
});

afterEach(() => cleanup());

describe('SidebarSection — status section (RFP)', () => {
  it('renders the section header link to its base path', () => {
    renderSection(rfpSection);
    expect(screen.getByRole('link', { name: 'RFP' })).toHaveAttribute('href', '/rfp');
  });

  it('renders action links before status sub-items', () => {
    renderSection(rfpSection);
    const subNav = screen.getByRole('link', { name: '새 RFP' }).parentElement;
    expect(subNav).not.toBeNull();
    const links = Array.from(subNav!.querySelectorAll('a')).map((a) => a.textContent);
    expect(links[0]).toBe('새 RFP');
    expect(links[1]).toBe('진행중');
  });

  it('renders status sub-items linking to status search params', () => {
    renderSection(rfpSection);
    expect(screen.getByRole('link', { name: '진행중' })).toHaveAttribute('href', '/rfp?status=active');
    expect(screen.getByRole('link', { name: '마감' })).toHaveAttribute('href', '/rfp?status=closed');
    expect(screen.getByRole('link', { name: '새 RFP' })).toHaveAttribute('href', '/rfp-create');
  });

  it('marks the matching status sub-item as active', () => {
    mockPathname.mockReturnValue('/rfp');
    mockSearchParams.mockReturnValue(new URLSearchParams('status=active'));
    renderSection(rfpSection);
    expect(screen.getByRole('link', { name: '진행중' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '마감' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'RFP' })).not.toHaveAttribute('aria-current');
  });

  it('marks the section header active on child routes', () => {
    mockPathname.mockReturnValue('/rfp/rfp-1');
    mockSearchParams.mockReturnValue(new URLSearchParams(''));
    renderSection(rfpSection);
    expect(screen.getByRole('link', { name: 'RFP' })).toHaveAttribute('aria-current', 'page');
  });

  it('collapses sub-items when the toggle is clicked', async () => {
    const user = userEvent.setup();
    renderSection(rfpSection);
    expect(screen.getByRole('link', { name: '진행중' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /RFP 섹션/ }));
    expect(screen.queryByRole('link', { name: '진행중' })).not.toBeInTheDocument();
  });
});

describe('SidebarSection — sub-item shortcuts', () => {
  it('reveals a status sub-item chord in a tooltip on hover', async () => {
    const user = userEvent.setup();
    const section: NavSection = {
      id: 'rfp',
      label: 'RFP',
      href: '/rfp',
      base: '/rfp',
      statuses: [
        { status: 'active', label: '진행중', shortcut: { kind: 'chord', lead: 'g', key: '1' } },
      ],
    };
    render(
      <SidebarProvider>
        <TooltipProvider delay={0}>
          <SidebarSection section={section} />
        </TooltipProvider>
      </SidebarProvider>,
    );
    await user.hover(screen.getByRole('link', { name: '진행중' }));
    expect(await screen.findByText('G')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});

describe('SidebarSection — links section (설정)', () => {
  it('renders the settings sub-links', () => {
    mockPathname.mockReturnValue('/settings/profile');
    renderSection(settingsSection);
    expect(screen.getByRole('link', { name: '프로필' })).toHaveAttribute('href', '/settings/profile');
    expect(screen.getByRole('link', { name: '멤버' })).toHaveAttribute('href', '/settings/members');
  });

  it('marks the active settings sub-link', () => {
    mockPathname.mockReturnValue('/settings/members');
    renderSection(settingsSection);
    expect(screen.getByRole('link', { name: '멤버' })).toHaveAttribute('aria-current', 'page');
  });

  it('marks the settings section header active on child routes', () => {
    mockPathname.mockReturnValue('/settings/members');
    renderSection(settingsSection);
    expect(screen.getByRole('link', { name: /설정/ })).toHaveAttribute('aria-current', 'page');
  });
});
