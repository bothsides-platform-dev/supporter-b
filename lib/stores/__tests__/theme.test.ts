import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useThemeStore } from '@/lib/stores/theme';

function mockMatchMedia(prefersDark: boolean) {
  const mq = {
    matches: prefersDark,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockReturnValue(mq),
  });
  return mq;
}

// app/layout.tsx 가 내보내는 두 개의 media 스코프 theme-color 메타를 재현한다.
function seedThemeColorMeta() {
  for (const media of ['(prefers-color-scheme: light)', '(prefers-color-scheme: dark)']) {
    const m = document.createElement('meta');
    m.setAttribute('name', 'theme-color');
    m.setAttribute('media', media);
    m.setAttribute('content', media.includes('dark') ? '#08090A' : '#FFFFFF');
    document.head.appendChild(m);
  }
}

/**
 * 브라우저가 실제로 고르는 크롬 색 — "tree order 상 media 가 매치되는 첫 태그".
 * jsdom 은 media 를 평가하지 않으므로 OS 선호를 인자로 받아 직접 판정한다.
 */
function effectiveChromeColor(prefersDark: boolean): string | null {
  for (const m of document.head.querySelectorAll('meta[name="theme-color"]')) {
    const media = m.getAttribute('media');
    if (media && media.includes('dark') !== prefersDark) continue;
    return m.getAttribute('content');
  }
  return null;
}

describe('useThemeStore', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark');
    localStorage.clear();
    useThemeStore.setState({ theme: 'light', resolvedTheme: 'light' });
    document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
    seedThemeColorMeta();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.classList.remove('dark');
  });

  it('setTheme("dark") adds "dark" to documentElement.classList', () => {
    mockMatchMedia(false);
    useThemeStore.getState().setTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('setTheme("dark") updates resolvedTheme to "dark"', () => {
    mockMatchMedia(false);
    useThemeStore.getState().setTheme('dark');
    expect(useThemeStore.getState().resolvedTheme).toBe('dark');
  });

  it('setTheme("light") removes "dark" from documentElement.classList', () => {
    mockMatchMedia(false);
    document.documentElement.classList.add('dark');
    useThemeStore.getState().setTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('setTheme("light") updates resolvedTheme to "light"', () => {
    mockMatchMedia(false);
    useThemeStore.getState().setTheme('light');
    expect(useThemeStore.getState().resolvedTheme).toBe('light');
  });

  it('setTheme("system") adds "dark" when system prefers dark', () => {
    mockMatchMedia(true);
    useThemeStore.getState().setTheme('system');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('setTheme("system") removes "dark" when system prefers light', () => {
    mockMatchMedia(false);
    document.documentElement.classList.add('dark');
    useThemeStore.getState().setTheme('system');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('setTheme("system") sets resolvedTheme to "dark" when system prefers dark', () => {
    mockMatchMedia(true);
    useThemeStore.getState().setTheme('system');
    expect(useThemeStore.getState().resolvedTheme).toBe('dark');
  });

  it('setTheme("system") sets resolvedTheme to "light" when system prefers light', () => {
    mockMatchMedia(false);
    useThemeStore.getState().setTheme('system');
    expect(useThemeStore.getState().resolvedTheme).toBe('light');
  });

  it('after rehydration with theme="dark", resolvedTheme resolves to "dark"', () => {
    mockMatchMedia(false);
    useThemeStore.setState({ theme: 'dark', resolvedTheme: 'light' });
    useThemeStore.getState().setTheme(useThemeStore.getState().theme);
    expect(useThemeStore.getState().resolvedTheme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('after rehydration with theme="system" and system dark, resolvedTheme resolves to "dark"', () => {
    mockMatchMedia(true);
    useThemeStore.setState({ theme: 'system', resolvedTheme: 'light' });
    useThemeStore.getState().setTheme(useThemeStore.getState().theme);
    expect(useThemeStore.getState().resolvedTheme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  // 인앱 테마 토글이 브라우저 크롬(모바일 상태바)을 따라가게 하는 계약.
  // 정적 `viewport.themeColor` 는 prefers-color-scheme 으로만 분기하므로, OS 와 다른
  // 테마를 인앱에서 고르면 캔버스와 상태바가 어긋난다.
  it('setTheme("dark") 는 OS 가 라이트여도 크롬 색을 다크 캔버스로 만든다', () => {
    mockMatchMedia(false);
    useThemeStore.getState().setTheme('dark');
    expect(effectiveChromeColor(/* prefersDark */ false)).toBe('#08090A');
  });

  it('setTheme("light") 는 OS 가 다크여도 크롬 색을 라이트 캔버스로 만든다', () => {
    mockMatchMedia(true);
    useThemeStore.getState().setTheme('light');
    expect(effectiveChromeColor(/* prefersDark */ true)).toBe('#FFFFFF');
  });

  it('setTheme("system") 도 실효 테마로 크롬 색을 맞춘다', () => {
    mockMatchMedia(true);
    useThemeStore.getState().setTheme('system');
    expect(effectiveChromeColor(true)).toBe('#08090A');
  });

  // system 모드에서 OS 설정이 바뀌는 경로 — 리팩터에서 가장 먼저 잊히는 갈래라 따로 잠근다.
  it('system 모드에서 OS 설정이 바뀌면 크롬 색도 따라간다', () => {
    const mq = mockMatchMedia(false);
    useThemeStore.getState().setTheme('system');
    expect(effectiveChromeColor(false)).toBe('#FFFFFF');

    const handler = mq.addEventListener.mock.calls[0][1] as (e: MediaQueryListEvent) => void;
    handler({ matches: true } as MediaQueryListEvent);
    expect(effectiveChromeColor(true)).toBe('#08090A');
  });

  it('repeated setTheme("system") calls do not leak multiple matchMedia listeners', () => {
    const mq = mockMatchMedia(true);
    useThemeStore.getState().setTheme('system');
    useThemeStore.getState().setTheme('system');
    expect(mq.addEventListener).toHaveBeenCalledTimes(2);
    expect(mq.removeEventListener).toHaveBeenCalledTimes(1);
  });
});
