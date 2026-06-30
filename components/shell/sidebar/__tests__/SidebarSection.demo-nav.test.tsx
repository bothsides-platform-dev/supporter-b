import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// 폴백 경로 검증용 — provider가 없을 때 실제 usePathname을 본다.
const realPathname = vi.hoisted(() => ({ value: '/somewhere-else' }));
vi.mock('next/navigation', () => ({
  usePathname: () => realPathname.value,
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import { SidebarSection } from '../SidebarSection';
import { SidebarProvider } from '@/components/ui/sidebar';
import { DemoNavProvider, isInertDemoNavHref, type DemoNavValue } from '@/lib/nav/demo-nav-context';
import { getNavConfig } from '@/lib/nav/nav-config';

const rfpSection = getNavConfig('buyer').sections.find((s) => s.id === 'rfp')!;

function renderSection(demo?: DemoNavValue) {
  const body = <SidebarSection section={rfpSection} />;
  return render(
    <SidebarProvider>
      {demo ? <DemoNavProvider value={demo}>{body}</DemoNavProvider> : body}
    </SidebarProvider>,
  );
}

function headerLink() {
  return screen.getByRole('link', { name: rfpSection.label });
}

describe('SidebarSection — 데모 내비 시드', () => {
  beforeEach(() => {
    realPathname.value = '/somewhere-else';
    // jsdom에는 matchMedia가 없다 — SidebarProvider(useIsMobile)가 요구.
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      media: '',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }) as unknown as typeof window.matchMedia;
  });

  it('데모 provider pathname이 base와 같고 status가 없으면 섹션 헤더가 활성된다', () => {
    renderSection({ pathname: '/rfp', search: '', navigate: vi.fn() });
    expect(headerLink()).toHaveAttribute('aria-current', 'page');
  });

  it('데모 provider에 status가 있으면 헤더는 비활성된다 (useNavSearchParams 경유)', () => {
    renderSection({ pathname: '/rfp', search: 'status=active', navigate: vi.fn() });
    expect(headerLink()).not.toHaveAttribute('aria-current', 'page');
  });

  it('provider가 없으면 실제 usePathname으로 동작한다 (프로덕션 무영향 회귀)', () => {
    realPathname.value = '/rfp';
    renderSection();
    expect(headerLink()).toHaveAttribute('aria-current', 'page');
  });

  it('inertHref가 있으면 라이브 항목은 링크, 비-라이브는 inert로 렌더한다', () => {
    render(
      <SidebarProvider>
        <DemoNavProvider value={{ pathname: '/rfp', search: '', navigate: vi.fn() }}>
          <SidebarSection section={rfpSection} inertHref={isInertDemoNavHref} />
        </DemoNavProvider>
      </SidebarProvider>,
    );
    // 헤더(/rfp)·새 견적 요청(/rfp-create)은 라이브 링크
    expect(screen.getByRole('link', { name: rfpSection.label })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '새 견적 요청' })).toBeInTheDocument();
    // 상태 필터(/rfp?status=...)는 inert → 링크가 아니다
    expect(screen.queryByRole('link', { name: '진행중' })).toBeNull();
    expect(screen.getByText('진행중').closest('[aria-disabled="true"]')).not.toBeNull();
  });

  it('inertHref가 없으면 모든 하위가 링크다 (실 셸 무영향)', () => {
    renderSection({ pathname: '/rfp', search: '', navigate: vi.fn() });
    expect(screen.getByRole('link', { name: '진행중' })).toBeInTheDocument();
  });
});
