'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

// 랜딩 데모가 실제 사이드바를 인플레이스로 구동하기 위한 컨텍스트. provider가 있으면
// 활성 상태 계산이 실제 URL 대신 데모가 제공하는 합성 pathname/search를 본다. provider가
// 없으면 모든 훅이 실제 Next 훅으로 폴백 — 프로덕션 동작에 영향이 없다(opt-in no-op).
export type DemoNavValue = {
  pathname: string;
  search: string;
  navigate: (href: string) => void;
};

const DemoNavContext = createContext<DemoNavValue | null>(null);

export function DemoNavProvider({ value, children }: { value: DemoNavValue; children: ReactNode }) {
  return <DemoNavContext.Provider value={value}>{children}</DemoNavContext.Provider>;
}

// 훅 규칙상 실제 훅도 항상 호출한 뒤 컨텍스트가 있을 때만 그 값을 우선한다.
export function useNavPathname(): string {
  const ctx = useContext(DemoNavContext);
  const real = usePathname();
  return ctx?.pathname ?? real;
}

export function useNavSearchParams(): URLSearchParams {
  const ctx = useContext(DemoNavContext);
  const real = useSearchParams();
  return ctx ? new URLSearchParams(ctx.search) : real;
}

export function useDemoNavigate(): ((href: string) => void) | null {
  return useContext(DemoNavContext)?.navigate ?? null;
}

// 사이드바에서 인터랙티브하게 유지할 데모 스토리 목적지. 그 밖은 모두 inert(비대화형)로 렌더.
export const DEMO_LIVE_NAV_HREFS = new Set(['/home', '/rfp', '/rfp-create']);

export function isInertDemoNavHref(href: string): boolean {
  return !DEMO_LIVE_NAV_HREFS.has(href);
}

// 사이드바/콘텐츠 내부 링크 href를 데모 페이지 인덱스(1~4)로 매핑. 데모에 없는 라우트는 null.
export function hrefToDemoPage(href: string): number | null {
  if (href === '/home') return 1;
  if (href.startsWith('/rfp-create')) return 4;
  if (href.startsWith('/rfp/')) return 3;
  if (href === '/rfp' || href.startsWith('/rfp?')) return 2;
  return null;
}

// ── PG 파트너 데모(홈 → 받은 요청 → 견적 작성 → 메시지) ───────────────
export const DEMO_PG_LIVE_NAV_HREFS = new Set(['/home', '/inbox', '/messages']);

export function isInertPgDemoNavHref(href: string): boolean {
  return !DEMO_PG_LIVE_NAV_HREFS.has(href);
}

export function hrefToPgDemoPage(href: string): number | null {
  if (href === '/home') return 1;
  if (href.startsWith('/inbox/')) return 3;
  if (href === '/inbox' || href.startsWith('/inbox?')) return 2;
  if (href === '/messages' || href.startsWith('/messages')) return 4;
  return null;
}
