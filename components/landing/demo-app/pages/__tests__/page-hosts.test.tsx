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
vi.mock('@/lib/landing/prefers-reduced-motion', () => ({ prefersReducedMotion: () => false }));

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

afterEach(cleanup);

describe('HomePageHost', () => {
  it('대시보드 KPI와 견적 요청하기 CTA를 렌더한다', () => {
    render(<HomePageHost />);
    expect(screen.getByText('진행 중')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /견적 요청하기/ })).toBeInTheDocument();
  });

  it('showCue면 안내 코치마크를 노출한다', () => {
    render(<HomePageHost showCue />);
    expect(screen.getByText('내 견적 현황을 한눈에 볼 수 있어요')).toBeInTheDocument();
  });
});

describe('RfpListPageHost', () => {
  it('행 클릭 시 onOpenRfp(code)를 호출한다', () => {
    const onOpenRfp = vi.fn();
    render(<RfpListPageHost onOpenRfp={onOpenRfp} />);
    fireEvent.click(screen.getByText('2026 결제 인프라 견적 요청'));
    expect(onOpenRfp).toHaveBeenCalledWith('P-2606-0042');
  });

  it('showCue면 "어디를 눌러야 하는지" 코치마크를 노출한다', () => {
    render(<RfpListPageHost onOpenRfp={vi.fn()} showCue />);
    expect(screen.getByText('견적 요청을 눌러 받은 견적을 확인해요')).toBeInTheDocument();
  });
});

describe('DealRoomPageHost', () => {
  it('DealRoomProvider 안에서 FocusComparison을 던지지 않고 렌더한다 + 가입 CTA', () => {
    render(<DealRoomPageHost />);
    expect(screen.getByText('지금 조건보다 이만큼 좋아져요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /시작하기/ })).toBeInTheDocument();
  });

  it('showCue면 비교·선정 안내 코치마크를 노출한다', () => {
    render(<DealRoomPageHost showCue />);
    expect(screen.getByText('PG별 견적을 비교하고 선정해요')).toBeInTheDocument();
  });
});

describe('WizardPageHost', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('마법사를 hideNav·guest로 마운트한다', () => {
    render(<WizardPageHost enabled={false} />);
    const w = screen.getByTestId('wizard');
    expect(w).toHaveAttribute('data-hidenav', 'true');
    expect(w).toHaveAttribute('data-guest', 'true');
  });

  it('enabled면 자동재생이 단계를 진행하며 draft를 채운다', () => {
    render(<WizardPageHost enabled />);
    expect(useRfpDraftStore.getState().title).toBe('');
    act(() => vi.advanceTimersByTime(5000));
    expect(useRfpDraftStore.getState().title).toBe('2026 결제 인프라 견적 요청');
  });

  it('showCue면 작성 안내 코치마크를 노출한다', () => {
    render(<WizardPageHost enabled={false} showCue />);
    expect(screen.getByText('정보를 입력하고 견적을 요청해요')).toBeInTheDocument();
  });
});
