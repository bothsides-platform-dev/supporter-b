import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  usePathname: () => '/inbox',
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
}));

import { PgInboxPageHost } from '../PgInboxPageHost';
import { DemoNavProvider } from '@/lib/nav/demo-nav-context';

afterEach(cleanup);

// 데모 받은 요청 화면은 실제 app/(app)/inbox/page.tsx 와 같은 chrome 을 써야 한다:
// PageHeader(제목·건수 칩) + BoardFilterBar.
describe('PgInboxPageHost — 실제 받은 요청 화면 정렬', () => {
  it('PageHeader(건수 칩)와 필터 바를 실제 컴포넌트로 렌더한다', () => {
    render(<PgInboxPageHost onOpenRfp={vi.fn()} />);
    expect(screen.getByTestId('page-header-count')).toHaveTextContent('3');
    expect(screen.getByRole('group', { name: '필터' })).toBeInTheDocument();
  });

  it('데모 nav 검색 파라미터를 실제 filterInboxRows 로 적용한다', () => {
    render(
      <DemoNavProvider value={{ pathname: '/inbox', search: 'status=submitted', navigate: vi.fn() }}>
        <PgInboxPageHost onOpenRfp={vi.fn()} />
      </DemoNavProvider>,
    );
    expect(screen.getByText('정기결제(빌링) 전환 견적')).toBeInTheDocument();
    expect(screen.queryByText('2026 결제 인프라 견적 요청')).not.toBeInTheDocument();
  });

  it('필터 칩 클릭은 실제 URL 이 아니라 데모 nav 로 나간다', () => {
    const navigate = vi.fn();
    render(
      <DemoNavProvider value={{ pathname: '/inbox', search: '', navigate }}>
        <PgInboxPageHost onOpenRfp={vi.fn()} />
      </DemoNavProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: '신규' }));
    expect(navigate).toHaveBeenCalledWith('/inbox?status=new');
  });

  it('행 클릭 시 onOpenRfp 를 호출한다', () => {
    const onOpenRfp = vi.fn();
    render(<PgInboxPageHost onOpenRfp={onOpenRfp} />);
    fireEvent.click(screen.getByText('2026 결제 인프라 견적 요청'));
    expect(onOpenRfp).toHaveBeenCalledWith('P-2606-0042');
  });
});
