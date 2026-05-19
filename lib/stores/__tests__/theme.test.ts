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

describe('useThemeStore', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark');
    localStorage.clear();
    useThemeStore.setState({ theme: 'light', resolvedTheme: 'light' });
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

  it('repeated setTheme("system") calls do not leak multiple matchMedia listeners', () => {
    const mq = mockMatchMedia(true);
    useThemeStore.getState().setTheme('system');
    useThemeStore.getState().setTheme('system');
    expect(mq.addEventListener).toHaveBeenCalledTimes(2);
    expect(mq.removeEventListener).toHaveBeenCalledTimes(1);
  });
});
