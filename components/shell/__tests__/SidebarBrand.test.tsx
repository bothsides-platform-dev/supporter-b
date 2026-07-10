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

// jsdom에서는 matchMedia 부재/재구독 타이밍 문제로 motion의 실제 리스너를 신뢰할 수 없어 훅을 직접 제어한다
let reduce = false;
vi.mock('motion/react', async (importOriginal) => {
  const mod = await importOriginal<typeof import('motion/react')>();
  return { ...mod, useReducedMotion: () => reduce };
});

import { SidebarProvider } from '@/components/ui/sidebar';
import { SidebarBrand } from '../SidebarBrand';

afterEach(() => {
  cleanup();
  reduce = false;
});

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

  it('mounts the icon mark in its pre-draw state (fill hidden) so it draws on after hard load', () => {
    render(
      <SidebarProvider>
        <SidebarBrand />
      </SidebarProvider>,
    );

    const link = screen.getByRole('link', { name: '서포트비 홈' });
    const path = link.querySelector('svg path') as SVGPathElement;
    expect(path).not.toBeNull();
    const fillHidden =
      path.style.fillOpacity === '0' || path.getAttribute('fill-opacity') === '0';
    expect(fillHidden).toBe(true);
  });

  it('renders the icon mark fully drawn and filled (no draw-on) under prefers-reduced-motion', () => {
    reduce = true;

    render(
      <SidebarProvider>
        <SidebarBrand />
      </SidebarProvider>,
    );

    const link = screen.getByRole('link', { name: '서포트비 홈' });
    const path = link.querySelector('svg path') as SVGPathElement;
    expect(path).not.toBeNull();
    expect(path.getAttribute('fill-opacity')).toBe('1');
    expect(path.getAttribute('stroke-dasharray')).toBe('1 1');
  });
});
