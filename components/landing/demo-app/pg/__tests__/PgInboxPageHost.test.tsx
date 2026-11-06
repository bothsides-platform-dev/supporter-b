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
    expect(screen.getByRole('navigation', { name: '업무 뷰' })).toBeInTheDocument();
  });

  it('데모 nav 검색 파라미터를 실제 filterInboxRows 로 적용한다', () => {
    render(
      <DemoNavProvider
        value={{ pathname: '/inbox', search: 'status=submitted', navigate: vi.fn() }}
      >
        <PgInboxPageHost onOpenRfp={vi.fn()} />
      </DemoNavProvider>,
    );
    expect(screen.getByText('정기결제(빌링) 전환 견적')).toBeInTheDocument();
    expect(screen.queryByText('2026 결제 인프라 견적 요청')).not.toBeInTheDocument();
  });

  it('필터 결과가 없으면 실제 빈 상태를 보여준다', () => {
    render(
      <DemoNavProvider value={{ pathname: '/inbox', search: 'grade=general', navigate: vi.fn() }}>
        <PgInboxPageHost onOpenRfp={vi.fn()} />
      </DemoNavProvider>,
    );
    expect(screen.getByText('조건에 맞는 견적 요청이 없어요.')).toBeInTheDocument();
    expect(screen.queryByText('아직 받은 견적 요청이 없어요.')).not.toBeInTheDocument();
  });

  it('필터 칩 클릭은 실제 URL 이 아니라 데모 nav 로 나간다', () => {
    const navigate = vi.fn();
    render(
      <DemoNavProvider value={{ pathname: '/inbox', search: '', navigate }}>
        <PgInboxPageHost onOpenRfp={vi.fn()} />
      </DemoNavProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /^응답 필요/ }));
    expect(navigate).toHaveBeenCalledWith('/inbox?status=response');
  });

  it('작성 행동은 onOpenRfp로 넓은 작업 화면을 연다', () => {
    const onOpenRfp = vi.fn();
    render(<PgInboxPageHost onOpenRfp={onOpenRfp} />);
    fireEvent.click(screen.getByRole('button', { name: '견적 작성' }));
    expect(onOpenRfp).toHaveBeenCalledWith('P-2606-0042', 'write');
  });
});

it('구매사 검색을 실제 목록에 적용한다', () => {
  render(
    <DemoNavProvider value={{ pathname: '/inbox', search: 'q=없는구매사', navigate: vi.fn() }}>
      <PgInboxPageHost onOpenRfp={vi.fn()} />
    </DemoNavProvider>,
  );
  expect(screen.queryByText('2026 결제 인프라 견적 요청')).not.toBeInTheDocument();
});

it('데모 홈도 같은 카드와 응답 집계를 사용한다', async () => {
  const { demoPgDashboard, demoPgInboxRows } = await import('../pg-demo-fixtures');
  expect(demoPgDashboard.requests).toEqual([demoPgInboxRows[0]]);
  expect(demoPgDashboard.kpis.find((k) => k.id === 'response')?.value).toBe(1);
  expect(demoPgInboxRows[0]).toMatchObject({
    buyerName: '브링콘파트너스',
    requiredPaymentMethods: ['card', 'bank_transfer'],
  });
});

it('검색 초기화는 데모 안에서 목록 조건만 제거한다', () => {
  const navigate = vi.fn();
  render(
    <DemoNavProvider
      value={{ pathname: '/inbox', search: 'q=없는구매사&grade=general&view=list', navigate }}
    >
      <PgInboxPageHost onOpenRfp={vi.fn()} />
    </DemoNavProvider>,
  );
  fireEvent.click(screen.getAllByRole('button', { name: '필터 초기화' }).at(-1)!);
  expect(navigate).toHaveBeenCalledWith('/inbox');
});
