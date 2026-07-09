import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

// motion/react useReducedMotion + SidebarProvider read matchMedia
vi.stubGlobal('matchMedia', (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/home',
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('@/lib/hooks/useIsMobile', () => ({
  useIsMobile: () => false,
}));

import { SidebarProvider } from '@/components/ui/sidebar';
import { SidebarBrand } from '../SidebarBrand';

afterEach(cleanup);

describe('SidebarBrand', () => {
  it('renders the 서포트비 wordmark as a /home link with the icon mark', () => {
    render(
      <SidebarProvider>
        <SidebarBrand />
      </SidebarProvider>,
    );

    const link = screen.getByRole('link', { name: '서포트비 홈' });
    expect(link.getAttribute('href')).toBe('/home');
    // wordmark is split into per-character spans; concatenated text is preserved
    expect(link.textContent).toContain('서포트비');
    // icon mark is rendered inline
    expect(link.querySelector('svg')).not.toBeNull();
  });
});
