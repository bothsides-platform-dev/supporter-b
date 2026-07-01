import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('next/navigation', () => ({
  usePathname: () => '/real-path',
  useSearchParams: () => new URLSearchParams('foo=bar'),
}));

import {
  DemoNavProvider,
  useNavPathname,
  useNavSearchParams,
  useDemoNavigate,
  hrefToDemoPage,
  isInertDemoNavHref,
  hrefToPgDemoPage,
  isInertPgDemoNavHref,
} from '../demo-nav-context';

function wrapper(value: { pathname: string; search: string; navigate: (href: string) => void }) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <DemoNavProvider value={value}>{children}</DemoNavProvider>
  );
  Wrapper.displayName = 'DemoNavWrapper';
  return Wrapper;
}

describe('demo-nav-context', () => {
  describe('useNavPathname', () => {
    it('provider 안에서는 데모 pathname을 반환한다', () => {
      const { result } = renderHook(() => useNavPathname(), {
        wrapper: wrapper({ pathname: '/rfp', search: '', navigate: vi.fn() }),
      });
      expect(result.current).toBe('/rfp');
    });

    it('provider 밖에서는 실제 usePathname으로 폴백한다 (프로덕션 무영향)', () => {
      const { result } = renderHook(() => useNavPathname());
      expect(result.current).toBe('/real-path');
    });
  });

  describe('useNavSearchParams', () => {
    it('provider 안에서는 데모 search를 파싱해 반환한다', () => {
      const { result } = renderHook(() => useNavSearchParams(), {
        wrapper: wrapper({ pathname: '/rfp', search: 'status=active', navigate: vi.fn() }),
      });
      expect(result.current.get('status')).toBe('active');
    });

    it('provider 밖에서는 실제 useSearchParams로 폴백한다', () => {
      const { result } = renderHook(() => useNavSearchParams());
      expect(result.current.get('foo')).toBe('bar');
    });
  });

  describe('useDemoNavigate', () => {
    it('provider 안에서는 navigate를 반환한다', () => {
      const navigate = vi.fn();
      const { result } = renderHook(() => useDemoNavigate(), {
        wrapper: wrapper({ pathname: '/home', search: '', navigate }),
      });
      result.current?.('/rfp');
      expect(navigate).toHaveBeenCalledWith('/rfp');
    });

    it('provider 밖에서는 null이다', () => {
      const { result } = renderHook(() => useDemoNavigate());
      expect(result.current).toBeNull();
    });
  });

  describe('hrefToDemoPage', () => {
    it.each([
      ['/home', 1],
      ['/rfp', 2],
      ['/rfp?status=active', 2],
      ['/rfp/P-2606-0001', 3],
      ['/rfp-create', 4],
    ])('%s → page %i', (href, page) => {
      expect(hrefToDemoPage(href)).toBe(page);
    });

    it.each(['/notifications', '/messages', '/settings/profile', '/'])(
      '%s → null (데모 페이지 아님)',
      (href) => {
        expect(hrefToDemoPage(href)).toBeNull();
      },
    );
  });

  describe('isInertDemoNavHref', () => {
    it('스토리 목적지(/home, /rfp, /rfp-create)는 inert가 아니다', () => {
      expect(isInertDemoNavHref('/home')).toBe(false);
      expect(isInertDemoNavHref('/rfp')).toBe(false);
      expect(isInertDemoNavHref('/rfp-create')).toBe(false);
    });

    it('그 밖의 항목(알림/메시지/설정/상태 필터)은 inert다', () => {
      expect(isInertDemoNavHref('/notifications')).toBe(true);
      expect(isInertDemoNavHref('/messages')).toBe(true);
      expect(isInertDemoNavHref('/settings/profile')).toBe(true);
      expect(isInertDemoNavHref('/rfp?status=active')).toBe(true);
    });
  });

  describe('hrefToPgDemoPage (PG 데모)', () => {
    it.each([
      ['/home', 1],
      ['/inbox', 2],
      ['/inbox?status=new', 2],
      ['/inbox/P-2606-0042', 3],
      ['/messages', 4],
    ])('%s → page %i', (href, page) => {
      expect(hrefToPgDemoPage(href)).toBe(page);
    });

    it.each(['/rfp', '/opportunities', '/settings/profile', '/'])(
      '%s → null (PG 데모 페이지 아님)',
      (href) => {
        expect(hrefToPgDemoPage(href)).toBeNull();
      },
    );
  });

  describe('isInertPgDemoNavHref', () => {
    it('PG 스토리 목적지(/home, /inbox, /messages)는 inert가 아니다', () => {
      expect(isInertPgDemoNavHref('/home')).toBe(false);
      expect(isInertPgDemoNavHref('/inbox')).toBe(false);
      expect(isInertPgDemoNavHref('/messages')).toBe(false);
    });

    it('그 밖의 항목(기회/견적템플릿/설정)은 inert다', () => {
      expect(isInertPgDemoNavHref('/opportunities')).toBe(true);
      expect(isInertPgDemoNavHref('/quote-templates')).toBe(true);
      expect(isInertPgDemoNavHref('/settings/profile')).toBe(true);
    });
  });
});
