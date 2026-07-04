import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { render as rtlRender, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { DealRoomProvider } from '@/components/deal-room/DealRoomContext';

// SampleBuyerDealRoom은 DealRoomFull/Modal 의 children 으로 렌더된다(실 딜룸의
// BuyerDealRoomBody 와 동일 위치) — 페이지가 제공하는 DealRoomProvider 를 흉내낸다.
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: DealRoomProvider });

vi.mock('@/components/messages/CounterpartyProfileCard', () => ({
  CounterpartyProfileCard: ({ counterparty }: { counterparty: { name: string } }) => (
    <span>{counterparty.name}</span>
  ),
}));
vi.mock('@/lib/http', () => ({ http: { post: vi.fn() } }));

const routerPushMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: routerPushMock, refresh: vi.fn() }) }));

// 실제 선정 액션이 절대 호출되지 않아야 한다 — 호출되면 이 mock 을 통해서만 감지 가능.
const awardRfpActionMock = vi.fn();
vi.mock('@/lib/server/actions/rfp', () => ({ awardRfpAction: (...a: unknown[]) => awardRfpActionMock(...a) }));
vi.mock('@/components/rfp/comparison/AwardResult', () => ({
  AwardResult: () => <div data-testid="real-award-result" />,
}));

const updateOnboardingMock = vi.fn(async (_i: unknown) => ({ ok: true as const }));
vi.mock('@/lib/server/actions/onboarding/updateOnboardingAction', () => ({
  updateOnboardingAction: (i: unknown) => updateOnboardingMock(i),
}));

const { fireMock } = vi.hoisted(() => {
  const fn = Object.assign(vi.fn(), { reset: vi.fn() });
  return { fireMock: fn };
});
vi.mock('canvas-confetti', () => ({
  default: Object.assign(vi.fn(), { create: vi.fn(() => fireMock), reset: vi.fn() }),
}));
vi.mock('motion/react', () => ({
  motion: new Proxy(
    {},
    {
      get:
        () =>
        ({ children, style, className }: Record<string, unknown>) => (
          <div style={style as React.CSSProperties} className={className as string}>
            {children as React.ReactNode}
          </div>
        ),
    },
  ),
}));

import { SampleBuyerDealRoom } from '../SampleBuyerDealRoom';
import { samplePgNames } from '@/lib/onboarding/fixtures';

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  Element.prototype.scrollIntoView ??= () => {};
});

afterEach(() => {
  cleanup();
  routerPushMock.mockClear();
  awardRfpActionMock.mockClear();
  updateOnboardingMock.mockClear();
});

describe('SampleBuyerDealRoom', () => {
  it('3개의 샘플 견적과 PG 이름을 보여준다', () => {
    render(<SampleBuyerDealRoom />);
    expect(screen.getAllByText(samplePgNames['sample-pg-a']).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/샘플페이 /).length).toBeGreaterThanOrEqual(3);
  });

  it('선정 CTA를 클릭하면 실제 선정 액션 없이 축하 화면을 띄우고 온보딩 완료를 기록한다', async () => {
    const user = userEvent.setup();
    render(<SampleBuyerDealRoom />);

    await user.click(screen.getByText('이 견적 선정하기 →'));

    expect(awardRfpActionMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('real-award-result')).not.toBeInTheDocument();
    expect(updateOnboardingMock).toHaveBeenCalledWith({ key: 'buyerSample', event: 'completed' });
    expect(screen.getByText(/실제 요청에서는 선정 즉시 PG에게 알림이 가요/)).toBeInTheDocument();
  });
});
