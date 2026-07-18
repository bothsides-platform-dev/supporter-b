import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Bid } from '@/lib/types/bid';
import { AwardResult } from '@/components/rfp/comparison/AwardResult';

const { routerPushMock } = vi.hoisted(() => ({ routerPushMock: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: vi.fn(() => ({ push: routerPushMock })) }));

const { getOrCreateMock } = vi.hoisted(() => ({ getOrCreateMock: vi.fn() }));
vi.mock('@/lib/server/actions/chat/getOrCreateConversationAction', () => ({
  getOrCreateConversationAction: getOrCreateMock,
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
      get: () => ({ children, style, className }: Record<string, unknown>) =>
        <div style={style as React.CSSProperties} className={className as string}>{children as React.ReactNode}</div>,
    },
  ),
}));

function makeBid(over: Partial<Bid> = {}): Bid {
  return {
    id: 'bid-1',
    rfpId: 'rfp-1',
    pgWsId: 'pg-ws-1',
    invitationId: 'inv-1',
    settleCycle: 'D+1',
    settleLimit: 50_000_000,
    guaranteeInsurance: 0,
    signupFee: 0,
    paymentFees: { card: 0.021 }, // 소수 요율 = 2.1% (paymentFees 스케일)
    customFees: {},
    proposalPdfs: [],
    status: 'submitted',
    submittedBy: 'u-1',
    boardColumnId: null,
    round: 1,
    ...over,
  };
}

beforeEach(() => {
  routerPushMock.mockClear();
  getOrCreateMock.mockReset();
  fireMock.mockClear();
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockReturnValue({ matches: false }),
  });
});
afterEach(cleanup);

describe('AwardResult', () => {
  const baseProps = {
    pgName: '토스페이먼츠',
    pgWsId: 'pg-ws-1',
    bid: makeBid(),
    tier: 'general' as const,
  };

  it('선정한 PG명과 완료 문구를 렌더한다', () => {
    render(<AwardResult {...baseProps} current={{}} />);
    expect(screen.getByText(/토스페이먼츠를 선정했어요/)).toBeInTheDocument();
    expect(screen.getByText(/견적 요청이 마무리됐어요/)).toBeInTheDocument();
  });

  it('받침 있는 PG명에는 올바른 조사(을/과)를 붙인다', () => {
    render(<AwardResult {...baseProps} pgName="한국정보통신" current={{}} />);
    expect(screen.getByText(/한국정보통신을 선정했어요/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /한국정보통신과 메시지 시작/ }),
    ).toBeInTheDocument();
  });

  it('현재 조건이 있으면 개선 델타(↓)를 렌더한다', () => {
    render(
      <AwardResult
        {...baseProps}
        current={{ feeRate: '2.5%' }}
      />,
    );
    expect(screen.getByTestId('metric-row-card')).toBeInTheDocument();
    expect(screen.getByText(/0\.40%p/)).toBeInTheDocument();
  });

  it('현재 조건이 없으면 화살표 없이 사실만 표기한다(폴백)', () => {
    render(<AwardResult {...baseProps} current={{}} />);
    expect(screen.queryAllByTestId('metric-arrow')).toHaveLength(0);
  });

  it('마운트 시 컨페티를 발사한다', () => {
    render(<AwardResult {...baseProps} current={{}} />);
    expect(fireMock).toHaveBeenCalled();
  });

  it('주 CTA 클릭 시 대화를 보장하고 /messages?c=<id>로 이동한다', async () => {
    getOrCreateMock.mockResolvedValue({ ok: true, conversationId: 'conv-9' });
    render(<AwardResult {...baseProps} current={{}} />);
    await userEvent.setup().click(
      screen.getByRole('button', { name: /메시지/ }),
    );
    expect(getOrCreateMock).toHaveBeenCalledWith('pg-ws-1');
    expect(routerPushMock).toHaveBeenCalledWith('/messages?c=conv-9');
  });

  it('보조 CTA 클릭 시 /rfp로 이동한다', async () => {
    render(<AwardResult {...baseProps} current={{}} />);
    await userEvent.setup().click(
      screen.getByRole('button', { name: '견적 목록으로' }),
    );
    expect(routerPushMock).toHaveBeenCalledWith('/rfp');
  });

  it('주 CTA에서 대화 보장이 실패하면 /messages로 폴백한다', async () => {
    getOrCreateMock.mockResolvedValue({ ok: false, error: 'BOOM' });
    render(<AwardResult {...baseProps} current={{}} />);
    await userEvent.setup().click(screen.getByRole('button', { name: /메시지/ }));
    expect(routerPushMock).toHaveBeenCalledWith('/messages');
  });

  it('주 CTA에서 액션이 throw해도 LOADING에 가두지 않고 /messages로 폴백한다', async () => {
    getOrCreateMock.mockRejectedValue(new Error('network down'));
    render(<AwardResult {...baseProps} current={{}} />);
    await userEvent.setup().click(screen.getByRole('button', { name: /메시지/ }));
    expect(routerPushMock).toHaveBeenCalledWith('/messages');
  });
});
