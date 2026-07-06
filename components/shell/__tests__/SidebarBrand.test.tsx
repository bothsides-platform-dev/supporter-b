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
import { WORDMARK_PATHS } from '@/components/primitives/wordmark-paths.generated';
import { SidebarBrand } from '../SidebarBrand';

afterEach(cleanup);

describe('SidebarBrand', () => {
  it('renders the 서포트 B wordmark as a /home link with the fixed icon mark + vector wordmark', () => {
    render(
      <SidebarProvider>
        <SidebarBrand />
      </SidebarProvider>,
    );

    const link = screen.getByRole('link', { name: '서포트 B 홈' });
    expect(link.getAttribute('href')).toBe('/home');
    // wordmark is now a vector glyph run (sr-only text keeps it readable for a11y/text search)
    expect(link.textContent).toContain('서포트 B');

    const svgs = link.querySelectorAll('svg');
    // 1) 고정 아이콘(BrandMark) + 2) 펼침/접힘 stagger 워드마크 svg
    expect(svgs.length).toBe(2);

    const wordmarkSvg = svgs[1];
    // 워드마크는 이제 글자 단위(motion.span)가 아니라 글리프 단위(motion.path)로 stagger된다.
    expect(wordmarkSvg.querySelectorAll('path').length).toBe(WORDMARK_PATHS.glyphs.length);
  });
});
