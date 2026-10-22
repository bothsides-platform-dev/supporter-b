import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import confetti from 'canvas-confetti';
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
  vi.mocked(confetti.create).mockClear();
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

  it('협의 완료와 PG의 3영업일 이메일 안내를 구분해 알려준다', () => {
    render(<AwardResult {...baseProps} current={{}} />);
    expect(screen.getByRole('dialog', { name: /최종 계약 조건 협의를.*마쳤어요/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', {name:'영업일 기준 3일 이내'})).toBeInTheDocument();
    expect(screen.getByText('토스페이먼츠 온보딩 담당자가 이메일을 보내드려요.')).toBeInTheDocument();
    expect(screen.getByText('받은 메일의 안내에 따라 최종 계약을 마무리해 주세요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /메시지/ })).not.toBeInTheDocument();
  });

  it.each([['토스페이먼츠', '토스페이먼츠와'], ['한국정보통신', '한국정보통신과']])('%s에 맞는 조사로 계약할 곳을 안내한다', (pgName, particle) => {
    render(<AwardResult {...baseProps} pgName={pgName} current={{}} />);
    expect(screen.getByText(new RegExp(`${particle} 계약을 진행해요`))).toBeInTheDocument();
  });

  it('조건은 접어 두고 펼쳤을 때 선택한 구간의 요율과 개선폭을 보여준다', async () => {
    render(<AwardResult {...baseProps} bid={makeBid({paymentFees:{card:{sole:0.01,general:0.021}}})} tier="sole" current={{feeRate:'2.5%'}} />);
    const toggle = screen.getByRole('button', { name: '선정한 조건 보기' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('1.00%')).not.toBeInTheDocument();
    await userEvent.setup().click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('1.00%')).toBeVisible();
    expect(screen.getByText(/1.50%p/)).toBeVisible();
    await userEvent.setup().click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('새 계약은 선정 조건만 보여주고 현재 조건 입력을 요구하지 않는다', async () => {
    render(<AwardResult {...baseProps} current={{}} />);
    await userEvent.setup().click(screen.getByRole('button', {name:'선정한 조건 보기'}));
    expect(screen.getByText('2.10%')).toBeVisible();
    expect(screen.queryByText(/현재 조건을 입력하면/)).not.toBeInTheDocument();
    expect(screen.queryAllByTestId('metric-arrow')).toHaveLength(0);
  });

  it('조건을 펼치고 접어도 축하 효과를 다시 실행하지 않고 모션 감소 설정을 유지한다', async () => {
    render(<AwardResult {...baseProps} current={{}} />);
    expect(confetti.create).toHaveBeenCalledWith(
      expect.any(HTMLCanvasElement),
      expect.objectContaining({ disableForReducedMotion: true }),
    );
    expect(fireMock).toHaveBeenCalled();
    const bursts = fireMock.mock.calls.length;
    const creations = vi.mocked(confetti.create).mock.calls.length;
    const user = userEvent.setup();
    const toggle = screen.getByRole('button', { name: '선정한 조건 보기' });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(fireMock).toHaveBeenCalledTimes(bursts);
    expect(confetti.create).toHaveBeenCalledTimes(creations);
  });

  it('목록으로 돌아갈 때 대화를 생성하지 않는다', async () => {
    render(<AwardResult {...baseProps} current={{}} />);
    await userEvent.setup().click(screen.getByRole('button', {name:'견적 목록으로 돌아가요'}));
    expect(routerPushMock).toHaveBeenCalledWith('/rfp');
    expect(getOrCreateMock).not.toHaveBeenCalled();
  });
});
