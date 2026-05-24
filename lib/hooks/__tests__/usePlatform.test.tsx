import { describe, it, expect, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  isMacPlatform,
  getModifierShortcutParts,
  useIsMac,
} from '@/lib/hooks/usePlatform';

describe('isMacPlatform', () => {
  it('returns true for a Mac platform string', () => {
    expect(isMacPlatform({ platform: 'MacIntel' })).toBe(true);
  });

  it('returns false for a Windows platform string', () => {
    expect(isMacPlatform({ platform: 'Win32' })).toBe(false);
  });

  it('returns false for a Linux platform string', () => {
    expect(isMacPlatform({ platform: 'Linux x86_64' })).toBe(false);
  });

  it('returns true for an iPhone/iPad user agent', () => {
    expect(
      isMacPlatform({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      }),
    ).toBe(true);
  });

  it('returns false when navigator info is missing', () => {
    expect(isMacPlatform(undefined)).toBe(false);
  });
});

describe('getModifierShortcutParts', () => {
  it('returns ⌘ and uppercased key on Mac', () => {
    expect(getModifierShortcutParts('k', true)).toEqual({
      modifier: '⌘',
      key: 'K',
    });
  });

  it('returns Ctrl and uppercased key on non-Mac', () => {
    expect(getModifierShortcutParts('k', false)).toEqual({
      modifier: 'Ctrl',
      key: 'K',
    });
  });

  it('uppercases other keys on non-Mac', () => {
    expect(getModifierShortcutParts('n', false)).toEqual({
      modifier: 'Ctrl',
      key: 'N',
    });
  });
});

describe('useIsMac', () => {
  afterEach(() => {
    // Remove the per-test own-property override so the prototype getter returns.
    delete (window.navigator as unknown as Record<string, unknown>).userAgent;
  });

  function stubUserAgent(ua: string) {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: ua,
    });
  }

  it('returns true on a Mac user agent', () => {
    stubUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
    const { result } = renderHook(() => useIsMac());
    expect(result.current).toBe(true);
  });

  it('returns false on a Windows user agent', () => {
    stubUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    const { result } = renderHook(() => useIsMac());
    expect(result.current).toBe(false);
  });
});
