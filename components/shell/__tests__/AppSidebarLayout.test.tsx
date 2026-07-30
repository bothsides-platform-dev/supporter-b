import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockPathname = vi.fn(() => '/home');
const mockSearchParams = vi.fn(() => new URLSearchParams(''));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), forward: vi.fn() }),
  usePathname: () => mockPathname(),
  useSearchParams: () => mockSearchParams(),
}));

vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({ unreadCount: 0, notifications: [], markRead: vi.fn() }),
}));

vi.mock('@/lib/hooks/useIsMobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('@/lib/hooks/usePlatform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/hooks/usePlatform')>()),
  useIsMac: () => false,
}));

vi.mock('@/lib/stores/theme', () => ({
  useThemeStore: (selector: (s: { resolvedTheme: string; setTheme: () => void }) => unknown) =>
    selector({ resolvedTheme: 'light', setTheme: vi.fn() }),
}));

vi.mock('@/lib/http', () => ({ http: { post: vi.fn() } }));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

import { AppSidebarLayout } from '../AppSidebarLayout';

const sidebar = {
  user: { id: 'u1', email: 'buyer@test.com', name: '홍길동', avatarUpdatedAt: null },
  workspaceType: 'buyer' as const,
  workspaces: [
    {
      id: 'ws1',
      name: '구매사A',
      type: 'buyer' as const,
      status: 'active' as const,
      role: 'admin' as const,
      memberApprovalStatus: 'approved' as const,
      unreadCount: 0,
      logoUpdatedAt: null,
    },
  ],
  current: { id: 'ws1', name: '구매사A', type: 'buyer' as const, logoUpdatedAt: null },
};

const header = {
  user: { id: 'u1', name: '홍길동', email: 'buyer@test.com', avatarUpdatedAt: null },
  workspaceType: 'buyer' as const,
};

function renderLayout(defaultSidebarOpen?: boolean) {
  return render(
    <AppSidebarLayout
      sidebar={sidebar}
      header={header}
      defaultSidebarOpen={defaultSidebarOpen}
    >
      <div>본문</div>
    </AppSidebarLayout>,
  );
}

// 데스크톱 헤더(hidden md:flex)와 모바일 상단 바(md:hidden)가 트리거를 하나씩
// 싣는다 — jsdom 은 미디어 쿼리를 적용하지 않아 둘 다 DOM 에 남는다. 데스크톱
// 경로를 검증하려면 헤더로 범위를 좁혀야 한다.
function desktopHeaderTrigger(name: RegExp | string) {
  const desktopHeader = Array.from(document.querySelectorAll('header')).find((h) =>
    h.className.includes('md:flex'),
  );
  expect(desktopHeader).toBeDefined();
  return within(desktopHeader!).getByRole('button', { name });
}

beforeEach(() => {
  mockPathname.mockReturnValue('/home');
  mockSearchParams.mockReturnValue(new URLSearchParams(''));
});

afterEach(() => cleanup());

// Header 와 Sidebar 는 AppSidebarLayout 의 같은 SidebarProvider 아래 형제다.
// 접기 버튼을 헤더로 옮긴 뒤 실제로 사이드바가 접히는지는 이 경계에서만 드러난다
// (Header.test 는 버튼 라벨 전환까지만, Sidebar.test 는 rail 경로만 본다).
describe('AppSidebarLayout — 헤더 트리거가 사이드바를 접는다', () => {
  it('collapses the sidebar when the header trigger is clicked', async () => {
    const user = userEvent.setup();
    renderLayout();

    const desktopSidebar = document.querySelector('[data-slot="sidebar"]');
    expect(desktopSidebar).toHaveAttribute('data-state', 'expanded');

    await user.click(desktopHeaderTrigger('사이드바 접기'));

    expect(desktopSidebar).toHaveAttribute('data-state', 'collapsed');
    expect(desktopSidebar).toHaveAttribute('data-collapsible', 'icon');
  });

  it('expands it again on a second click', async () => {
    const user = userEvent.setup();
    renderLayout();

    await user.click(desktopHeaderTrigger('사이드바 접기'));
    await user.click(desktopHeaderTrigger('사이드바 펼치기'));

    expect(document.querySelector('[data-slot="sidebar"]')).toHaveAttribute(
      'data-state',
      'expanded',
    );
  });

  // 서버(app/(app)/layout.tsx)가 sidebar_state 쿠키를 읽어 넘긴 값이다.
  // 첫 렌더부터 접힌 폭으로 그려져야 새로고침 시 펼쳤다 접히는 깜빡임이 없다.
  it('starts collapsed when the server says the sidebar was collapsed', () => {
    renderLayout(false);
    expect(document.querySelector('[data-slot="sidebar"]')).toHaveAttribute(
      'data-state',
      'collapsed',
    );
  });

  it('starts expanded when the server says it was expanded', () => {
    renderLayout(true);
    expect(document.querySelector('[data-slot="sidebar"]')).toHaveAttribute(
      'data-state',
      'expanded',
    );
  });

  // 첫 방문(쿠키 없음)은 레이아웃이 undefined 를 넘긴다 — 펼침이 기본이다.
  it('defaults to expanded when the server passes nothing', () => {
    renderLayout(undefined);
    expect(document.querySelector('[data-slot="sidebar"]')).toHaveAttribute(
      'data-state',
      'expanded',
    );
  });

  // 데스크톱 헤더(hidden md:flex)와 모바일 상단 바(md:hidden)가 각각 트리거를
  // 하나씩 싣는다. 둘 다 DOM 에 있는 것이 정상이고, 사이드바 안에는 없어야 한다.
  it('keeps the sidebar itself free of a collapse trigger', () => {
    renderLayout();
    const desktopSidebar = document.querySelector('[data-slot="sidebar"]');
    expect(desktopSidebar!.querySelector('[data-sidebar="trigger"]')).toBeNull();
  });
});
