import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PaymentMethod } from '@/lib/types/bid';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
vi.mock('@/lib/http', () => ({ http: { post: vi.fn() } }));
vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('use http client')));

const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock, refresh: refreshMock }) }));

const submitBidMock = vi.fn(async (_i: unknown) => ({ ok: true as const, bidId: 'b1' }));
vi.mock('@/lib/server/actions/bid', () => ({
  submitBidAction: (i: unknown) => submitBidMock(i),
}));

const simulateAwardMock = vi.fn(async (_i: unknown) => ({ ok: true as const }));
vi.mock('@/lib/server/actions/onboarding/simulateSampleAwardAction', () => ({
  simulateSampleAwardAction: (i: unknown) => simulateAwardMock(i),
}));

// 축하까지의 지연을 짧게 — 인터랙티브 흐름은 그대로, 테스트는 실제 타이머로 빠르게.
vi.mock('../sample-award', () => ({ SAMPLE_AWARD_DELAY_MS: 20 }));

vi.mock('@/lib/server/actions/quote-template/saveQuoteTemplateAction', () => ({
  saveQuoteTemplateAction: vi.fn(async () => ({ ok: true as const, templateId: 't1' })),
}));
vi.mock('../../RfpBriefPanel', () => ({ RfpBriefPanel: () => <div /> }));
vi.mock('@/components/messages/CounterpartyProfileCard', () => ({
  CounterpartyProfileCard: ({ counterparty }: { counterparty: { name: string } }) => (
    <span>{counterparty.name}</span>
  ),
}));

// 축하 오버레이가 마운트하므로 컨페티/모션을 jsdom-안전하게 목킹.
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

import { BidWizard } from '../BidWizard';

const sampleRfp = {
  id: 'rfp-uuid',
  code: 'P-2606-0001',
  requiredPaymentMethods: ['card'] as PaymentMethod[],
  customPaymentMethods: [],
  isSample: true,
} as never;

beforeEach(() => {
  localStorage.clear();
  pushMock.mockClear();
  refreshMock.mockClear();
  submitBidMock.mockClear();
  simulateAwardMock.mockClear();
});
afterEach(cleanup);

async function driveToSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.clear(screen.getByPlaceholderText('1'));
  await user.type(screen.getByPlaceholderText('1'), '1');
  await user.click(screen.getByRole('button', { name: '수수료' }));
  await user.type(screen.getByTestId('fee-cell-card-general'), '1.5');
  await user.click(screen.getByRole('button', { name: '견적서' }));
  await user.click(screen.getByRole('button', { name: '검토·발송' }));
  await user.click(screen.getByRole('button', { name: '견적 보내기' }));
  await user.click(screen.getByRole('button', { name: '견적 보내기', hidden: false }));
}

describe('BidWizard 샘플 제출 흐름', () => {
  it('샘플 제출 시 /submitted 로 가지 않고 검토중 안내를 띄운다', async () => {
    const user = userEvent.setup();
    render(<BidWizard rfp={sampleRfp} buyerName="샘플 쇼핑몰" />);
    await driveToSubmit(user);

    await waitFor(() => expect(submitBidMock).toHaveBeenCalledTimes(1));
    expect(pushMock).not.toHaveBeenCalledWith('/inbox/P-2606-0001/submitted');
    expect(screen.getByText(/검토하고 있어요/)).toBeInTheDocument();
  });

  it('잠시 뒤 샘플 선정을 시뮬레이트하고 축하 화면을 보여준다', async () => {
    const user = userEvent.setup();
    render(<BidWizard rfp={sampleRfp} buyerName="샘플 쇼핑몰" />);
    await driveToSubmit(user);

    await waitFor(() => expect(simulateAwardMock).toHaveBeenCalledWith({ code: 'P-2606-0001' }));
    await waitFor(() => expect(screen.getByText('견적이 선정됐어요')).toBeInTheDocument());
    expect(refreshMock).toHaveBeenCalled();
  });
});
