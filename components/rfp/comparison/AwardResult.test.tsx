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
    bid: makeBid(),
    tier: 'general' as const,
  };

  it.each(['토스페이먼츠', '한국정보통신'])('계약 진행과 %s의 이메일 안내를 표시한다', (pgName) => {
    render(<AwardResult {...baseProps} pgName={pgName} current={{}} />);
    expect(screen.getByRole('dialog', { name: '최종 계약 조건 협의를 마쳤어요' })).toBeInTheDocument();
    expect(screen.getByText(pgName === '한국정보통신' ? /한국정보통신과 계약을 진행해요/ : /토스페이먼츠와 계약을 진행해요/)).toBeInTheDocument();
    expect(screen.getByText(`${pgName} 온보딩 담당자가 이메일을 보내드려요.`)).toBeInTheDocument();
  });

  it('조건은 접혀 있고 펼치면 선정 견적의 요율과 개선폭을 보여준다', async () => {
    render(<AwardResult {...baseProps} current={{ feeRate: '2.5%' }} />);
    expect(screen.queryByTestId('metric-row-card')).not.toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: '선정한 조건 보기' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('2.10%')).toBeVisible();
    expect(screen.getByText(/0\.40%p/)).toBeVisible();
    await userEvent.click(toggle);
    expect(screen.queryByTestId('metric-row-card')).not.toBeInTheDocument();
  });

  it('현재 조건이 없는 완료 화면에서 입력을 요구하지 않는다', async () => {
    render(<AwardResult {...baseProps} current={{}} />);
    await userEvent.click(screen.getByRole('button', { name: '선정한 조건 보기' }));
    expect(screen.queryByText(/현재 조건을 입력하면/)).not.toBeInTheDocument();
    expect(screen.getByText('2.10%')).toBeVisible();
  });

  it('목록으로 이동하며 대화는 만들지 않는다', async () => {
    render(<AwardResult {...baseProps} current={{}} />);
    await userEvent.click(screen.getByRole('button', { name: '견적 목록으로 돌아가요' }));
    expect(routerPushMock).toHaveBeenCalledWith('/rfp');
    expect(getOrCreateMock).not.toHaveBeenCalled();
  });

  it('조건을 펼쳐도 축하 효과를 다시 실행하지 않고 모션 감소 옵션을 유지한다', async () => {
    const confetti = (await import('canvas-confetti')).default;
    render(<AwardResult {...baseProps} current={{}} />);
    expect(confetti.create).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), expect.objectContaining({ disableForReducedMotion: true }));
    const calls = fireMock.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: '선정한 조건 보기' }));
    expect(fireMock).toHaveBeenCalledTimes(calls);
  });

  it('Escape로 완료 화면을 닫아 배경으로 돌아가지 않는다', async () => {
    render(<AwardResult {...baseProps} current={{}} />);
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
