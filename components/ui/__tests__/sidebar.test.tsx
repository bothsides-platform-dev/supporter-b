import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import {
  Sidebar,
  SidebarContent,
  SidebarProvider,
  SidebarTrigger,
} from '../sidebar';
import { SIDEBAR_COOKIE_MAX_AGE, SIDEBAR_COOKIE_NAME } from '@/lib/shell/sidebar-cookie';

// 이 파일이 지키는 것: **쿠키 쓰기 쪽**.
//
// 원래 버그는 SidebarProvider 가 sidebar_state 를 쓰기만 하고 읽는 쪽이 없어
// 접힘이 새로고침마다 리셋된 것이었다. 읽는 쪽(app/(app)/layout.tsx)과 상수
// (lib/shell/sidebar-cookie.ts)는 각자 테스트가 있는데, **쓰기 자체는 어디에도
// 못박혀 있지 않았다** — 랜딩 데모의 `not.toContain('sidebar_state=false')` 는
// "데모는 쓰면 안 된다"는 반대 방향 단언이라, 쿠키 이름·path·max-age 가 밀리거나
// 상수 import 가 끊겨도 전 스위트가 그대로 그린이었다. 왕복의 없는 절반을 채운다.

let mockIsMobile = false;
vi.mock('@/lib/hooks/useIsMobile', () => ({
  useIsMobile: () => mockIsMobile,
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

function stubMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

function clearSidebarCookie() {
  document.cookie = `${SIDEBAR_COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
}

/** document.cookie 는 접근자라 setter 를 가로채야 쓰기 원문(path·max-age)을 볼 수 있다. */
function captureCookieWrites(): { writes: string[]; restore: () => void } {
  const writes: string[] = [];
  const proto = Object.getPrototypeOf(document) as Document;
  const desc = Object.getOwnPropertyDescriptor(proto, 'cookie')!;
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: () => desc.get!.call(document),
    set: (value: string) => {
      writes.push(value);
      desc.set!.call(document, value);
    },
  });
  return {
    writes,
    restore: () => {
      delete (document as unknown as Record<string, unknown>).cookie;
    },
  };
}

// 클릭 손잡이로 셸의 `ShellSidebarTrigger` 가 아니라 vendored `SidebarTrigger` 를
// 쓴다 — 여기서 보려는 건 `SidebarProvider` 의 계약(쿠키·단축키·모바일 분기)이지
// 셸 래퍼의 라벨·아이콘이 아니다. 그쪽은 ShellSidebarTrigger.test.tsx 가 본다.
function renderSidebar(defaultOpen = true) {
  return render(
    <SidebarProvider defaultOpen={defaultOpen}>
      <Sidebar collapsible="icon">
        <SidebarContent>nav</SidebarContent>
      </Sidebar>
      <SidebarTrigger />
    </SidebarProvider>,
  );
}

const trigger = () => screen.getByRole('button', { name: '사이드바 열기/닫기' });

beforeEach(() => {
  mockIsMobile = false;
  stubMatchMedia();
  clearSidebarCookie();
});

afterEach(() => {
  clearSidebarCookie();
});

describe('SidebarProvider — 접힘 상태 쿠키 쓰기', () => {
  it('접으면 sidebar_state=false 를 기록한다', () => {
    renderSidebar(true);

    fireEvent.click(trigger());

    expect(document.cookie).toContain(`${SIDEBAR_COOKIE_NAME}=false`);
  });

  it('다시 펼치면 sidebar_state=true 로 덮어쓴다', () => {
    renderSidebar(true);

    fireEvent.click(trigger());
    fireEvent.click(trigger());

    expect(document.cookie).toContain(`${SIDEBAR_COOKIE_NAME}=true`);
    expect(document.cookie).not.toContain(`${SIDEBAR_COOKIE_NAME}=false`);
  });

  // path 가 빠지면 쿠키가 현재 경로에만 붙어 다른 화면에서 복원이 조용히 실패한다.
  // max-age 가 빠지면 세션 쿠키가 되어 브라우저를 닫는 순간 사라진다.
  it('공유 상수의 path 와 max-age 를 실어 보낸다', () => {
    const { writes, restore } = captureCookieWrites();
    try {
      renderSidebar(true);
      fireEvent.click(trigger());

      const write = writes.find((w) => w.startsWith(`${SIDEBAR_COOKIE_NAME}=`));
      expect(write).toBeDefined();
      expect(write).toContain('path=/');
      expect(write).toContain(`max-age=${SIDEBAR_COOKIE_MAX_AGE}`);
    } finally {
      restore();
    }
  });
});

describe('SidebarProvider — ⌘/Ctrl+B 단축키', () => {
  it('⌘B 가 사이드바를 접는다', () => {
    renderSidebar(true);

    fireEvent.keyDown(window, { key: 'b', metaKey: true });

    expect(document.querySelector('[data-slot="sidebar"]')).toHaveAttribute(
      'data-state',
      'collapsed',
    );
    expect(document.cookie).toContain(`${SIDEBAR_COOKIE_NAME}=false`);
  });

  it('Ctrl+B 도 같은 경로다', () => {
    renderSidebar(true);

    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });

    expect(document.querySelector('[data-slot="sidebar"]')).toHaveAttribute(
      'data-state',
      'collapsed',
    );
  });

  it('모디파이어 없는 b 나 ⌘K 는 토글하지 않는다', () => {
    renderSidebar(true);

    fireEvent.keyDown(window, { key: 'b' });
    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    expect(document.querySelector('[data-slot="sidebar"]')).toHaveAttribute(
      'data-state',
      'expanded',
    );
    expect(document.cookie).not.toContain(`${SIDEBAR_COOKIE_NAME}=`);
  });
});

// 모바일 토글은 openMobile(시트)만 움직인다. 여기서 쿠키를 쓰면 폰에서 햄버거를
// 한 번 누를 때마다 데스크톱에 저장해둔 레이아웃이 덮어써진다.
describe('SidebarProvider — 모바일 시트는 데스크톱 상태를 건드리지 않는다', () => {
  beforeEach(() => {
    mockIsMobile = true;
  });

  it('시트를 열어도 sidebar_state 를 기록하지 않는다', () => {
    renderSidebar(true);

    fireEvent.click(trigger());

    expect(document.querySelector('[data-mobile="true"]')).not.toBeNull();
    expect(document.cookie).not.toContain(`${SIDEBAR_COOKIE_NAME}=`);
  });

  // `defaultOpen={true}` 여야 판별력이 있다. `false` 로 부르면 `openMobile` 이
  // `useState(defaultOpen)` 로 잘못 배선돼도 어차피 닫혀 있어 통과해버린다 —
  // 막으려는 회귀가 정확히 그 오배선이다.
  it('서버가 넘긴 펼침 상태가 시트를 열어두지 않는다', () => {
    renderSidebar(true);

    expect(document.querySelector('[data-mobile="true"]')).toBeNull();
  });
});
