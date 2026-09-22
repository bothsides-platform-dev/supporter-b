import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  usePathname: () => '/home',
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/lib/toast', () => ({ toast: vi.fn() }));
vi.mock('@/lib/server/actions/onboarding/deleteSampleRfpAction', () => ({
  deleteSampleRfpAction: vi.fn(async () => ({ ok: true })),
}));
// 실제 페이지 컴포넌트들이 정적 import하는 서버 액션/모듈 — 테스트 환경의 next-auth
// 체인을 끊기 위해 모킹(액션은 호출되지 않는다). 기존 FocusComparison/HomeDashboard
// 테스트의 모킹을 그대로 따른다.
vi.mock('@/lib/http', () => ({ http: { post: vi.fn(), get: vi.fn() } }));
vi.mock('@/lib/server/actions/rfp', () => ({
  awardRfpAction: vi.fn(),
  requestRequoteAction: vi.fn(),
  cancelRfpAction: vi.fn(),
  closeRfpAction: vi.fn(),
  createPgRequestAction: vi.fn(),
}));
vi.mock('@/lib/server/actions/rfp/requestRequoteAction', () => ({ requestRequoteAction: vi.fn() }));
vi.mock('@/lib/server/actions/chat/getOrCreateConversationAction', () => ({
  getOrCreateConversationAction: vi.fn(),
}));
vi.mock('@/components/messages/CounterpartyProfileCard', () => ({
  CounterpartyProfileCard: () => <div data-testid="counterparty" />,
}));

// 실제 마법사는 자체 테스트 보유 — 호스트 배선만 검증하도록 stub.
vi.mock('@/components/rfp/RfpCreateWizard', () => ({
  RfpCreateWizard: (props: Record<string, unknown>) => (
    <div data-testid="wizard" data-hidenav={String(props.hideNav)} data-guest={String(props.guest)} />
  ),
}));

import { HomePageHost } from '../HomePageHost';
import { RfpListPageHost } from '../RfpListPageHost';
import { DealRoomPageHost } from '../DealRoomPageHost';
import { WizardPageHost } from '../WizardPageHost';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';
import { DemoNavProvider } from '@/lib/nav/demo-nav-context';

afterEach(cleanup);

describe('HomePageHost', () => {
  it('대시보드 KPI와 견적 요청하기 CTA를 렌더한다', () => {
    render(<HomePageHost />);
    expect(screen.getByText('진행 중')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /견적 요청하기/ })).toBeInTheDocument();
  });
});

// ── 실제 화면 정렬(parity) ──────────────────────────────────────
// 데모 목록 화면은 실제 app/(app)/rfp/page.tsx 와 같은 chrome 을 써야 한다:
// PageHeader(제목·건수 칩·견적 요청하기) + BoardFilterBar + 진행 상태 열.
describe('RfpListPageHost — 실제 목록 화면 정렬', () => {
  it('PageHeader(건수 칩·CTA)와 필터 바를 실제 컴포넌트로 렌더한다', () => {
    render(<RfpListPageHost onOpenRfp={vi.fn()} />);
    expect(screen.getByTestId('page-header-count')).toHaveTextContent('3');
    expect(screen.getByTestId('page-header-action')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '필터' })).toBeInTheDocument();
  });

  it('진행 상태 열을 실제 목록처럼 채운다', () => {
    render(<RfpListPageHost onOpenRfp={vi.fn()} />);
    expect(screen.getAllByText('견적 도착').length).toBeGreaterThan(0);
  });

  it('데모 nav 검색 파라미터를 실제 filterRfps 로 적용한다', () => {
    render(
      <DemoNavProvider value={{ pathname: '/rfp', search: 'status=closed', navigate: vi.fn() }}>
        <RfpListPageHost onOpenRfp={vi.fn()} />
      </DemoNavProvider>,
    );
    expect(screen.queryByText('2026 결제 인프라 견적 요청')).not.toBeInTheDocument();
  });

  it('필터 결과가 없으면 실제 빈 상태를 보여준다', () => {
    render(
      <DemoNavProvider value={{ pathname: '/rfp', search: 'grade=general', navigate: vi.fn() }}>
        <RfpListPageHost onOpenRfp={vi.fn()} />
      </DemoNavProvider>,
    );
    expect(screen.getByText('아직 보낸 견적 요청이 없어요.')).toBeInTheDocument();
  });

  it('필터 칩 클릭은 실제 URL 이 아니라 데모 nav 로 나간다', () => {
    const navigate = vi.fn();
    render(
      <DemoNavProvider value={{ pathname: '/rfp', search: '', navigate }}>
        <RfpListPageHost onOpenRfp={vi.fn()} />
      </DemoNavProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: '마감' }));
    expect(navigate).toHaveBeenCalledWith('/rfp?status=closed');
  });
});

describe('RfpListPageHost', () => {
  it('행 클릭 시 onOpenRfp(code)를 호출한다', () => {
    const onOpenRfp = vi.fn();
    render(<RfpListPageHost onOpenRfp={onOpenRfp} />);
    fireEvent.click(screen.getByText('2026 결제 인프라 견적 요청'));
    expect(onOpenRfp).toHaveBeenCalledWith('P-2606-0042');
  });
});

describe('DealRoomPageHost', () => {
  it('DealRoomProvider 안에서 FocusComparison을 던지지 않고 렌더한다 + 가입 CTA', () => {
    render(<DealRoomPageHost />);
    expect(screen.getByText('지금 조건보다 이만큼 좋아져요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /시작하기/ })).toBeInTheDocument();
  });
});

describe('WizardPageHost', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('마법사를 guest로, nav를 노출한 채(hideNav 미지정) 마운트한다', () => {
    render(<WizardPageHost enabled={false} />);
    const w = screen.getByTestId('wizard');
    // 클릭 진행 데모라 위저드 자체 nav('다음'/'보내기')를 보여준다.
    expect(w).not.toHaveAttribute('data-hidenav', 'true');
    expect(w).toHaveAttribute('data-guest', 'true');
  });

  it('enabled면 자동재생이 단계를 진행하며 draft를 채운다', () => {
    render(<WizardPageHost enabled />);
    expect(useRfpDraftStore.getState().title).toBe('');
    act(() => vi.advanceTimersByTime(5000));
    expect(useRfpDraftStore.getState().title).toBe('2026 결제 인프라 견적 요청');
  });
});
