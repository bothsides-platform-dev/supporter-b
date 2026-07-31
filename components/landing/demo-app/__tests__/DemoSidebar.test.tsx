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

  // 푸터는 랜딩(공개 마케팅 면)에 실리는 **진짜** 셸 컴포넌트다 — 테마 토글은
  // 누르면 방문자의 실제 테마를 뒤집는다. 그래서 데모에서는 aria-hidden +
  // pointer-events-none 안에 갇혀 있어야 한다. 그 껍데기가 사라지면 랜딩에서
  // 클릭 가능한 진짜 토글이 생기는데, 조용히 일어난다.
  it('푸터 컨트롤을 비활성 껍데기 안에 가둔다', () => {
    renderSidebar('/home');

    const toolbar = document.querySelector('[data-testid="sidebar-footer-toolbar"]');
    expect(toolbar).not.toBeNull();

    const inert = toolbar!.closest('[aria-hidden="true"]');
    expect(inert, '푸터가 aria-hidden 안에 있어야 한다').not.toBeNull();
    expect(inert!.className).toMatch(/pointer-events-none/);

    // aria-hidden 이므로 접근성 트리에 이름이 노출되지 않는다.
    expect(screen.queryByRole('button', { name: '다크 모드로 전환' })).toBeNull();
    expect(screen.queryByRole('button', { name: '문의하기' })).toBeNull();
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
