import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import { NavItem } from '../NavItem';
import { SidebarProvider } from '@/components/ui/sidebar';

function renderItem(node: React.ReactNode) {
  return render(<SidebarProvider>{node}</SidebarProvider>);
}

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false, media: '', onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }) as unknown as typeof window.matchMedia;
});

describe('NavItem', () => {
  it('기본은 동작하는 링크다', () => {
    renderItem(<NavItem href="/home" label="홈" />);
    expect(screen.getByRole('link', { name: '홈' })).toHaveAttribute('href', '/home');
  });

  it('inert면 링크가 아니라 aria-disabled 비활성 요소로 렌더한다', () => {
    renderItem(<NavItem href="/notifications" label="알림" inert />);
    expect(screen.queryByRole('link', { name: '알림' })).toBeNull();
    expect(screen.getByText('알림').closest('[aria-disabled="true"]')).not.toBeNull();
  });
});
