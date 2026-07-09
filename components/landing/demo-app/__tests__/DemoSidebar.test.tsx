import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
}));

import { DemoSidebar } from '../DemoSidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { DemoNavProvider } from '@/lib/nav/demo-nav-context';

function renderSidebar(pathname: string) {
  const value = { pathname, search: '', navigate: vi.fn() };
  return render(
    <SidebarProvider>
      <DemoNavProvider value={value}>
        <DemoSidebar workspaceName="서포트비" />
      </DemoNavProvider>
    </SidebarProvider>,
  );
}

describe('DemoSidebar — 임베디드 데모 사이드바', () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false, media: '', onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    }) as unknown as typeof window.matchMedia;
  });

  it('스토리 목적지(홈/견적 요청/새 견적 요청)는 링크로 렌더한다', () => {
    renderSidebar('/home');
    for (const label of ['홈', '견적 요청', '새 견적 요청']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('비-스토리 항목(알림/메시지/설정/상태 필터)은 inert로 렌더한다', () => {
    renderSidebar('/home');
    for (const label of ['알림', '메시지', '설정', '진행중']) {
      expect(screen.queryByRole('link', { name: label })).toBeNull();
      expect(screen.getByText(label).closest('[aria-disabled="true"]')).not.toBeNull();
    }
  });

  it('데모 pathname에 따라 홈이 활성으로 표시된다', () => {
    renderSidebar('/home');
    expect(screen.getByRole('link', { name: '홈' })).toHaveAttribute('aria-current', 'page');
  });

  it('워크스페이스 이름을 정적 표기한다 (전환 드롭다운 없음)', () => {
    renderSidebar('/home');
    expect(screen.getByText('서포트비')).toBeInTheDocument();
  });

  it('미읽음 알림 배지를 그리지 않는다 (useNotifications 미연결)', () => {
    renderSidebar('/home');
    expect(screen.queryByTestId('unread-badge')).not.toBeInTheDocument();
  });
});
