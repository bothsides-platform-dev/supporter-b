import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PaymentMethod } from '@/lib/types/bid';

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));

const submitBidMock = vi.fn(async (_i: unknown) => ({ ok: true as const, bidId: 'b1' }));
vi.mock('@/lib/server/actions/bid', () => ({
  submitBidAction: (i: unknown) => submitBidMock(i),
}));
vi.mock('@/lib/server/actions/quote-template/saveQuoteTemplateAction', () => ({
  saveQuoteTemplateAction: vi.fn(async () => ({ ok: true as const, templateId: 't1' })),
}));
vi.mock('../../RfpBriefPanel', () => ({ RfpBriefPanel: () => <div /> }));

import { BidWizard } from '../BidWizard';

const rfp = {
  id: 'rfp-uuid',
  code: 'P-2606-0001',
  requiredPaymentMethods: ['card'] as PaymentMethod[],
  customPaymentMethods: [],
} as never;

// PercentInput 은 label↔input aria 연결이 없어 라벨 텍스트 컨테이너에서 input 을 찾는다.
function feeInput(labelText: string): HTMLInputElement {
  const label = screen.getByText(labelText);
  return label.closest('.space-y-1')!.querySelector('input[type="number"]') as HTMLInputElement;
}

beforeEach(() => {
  localStorage.clear();
  pushMock.mockClear();
  submitBidMock.mockClear();
});
afterEach(cleanup);

describe('BidWizard', () => {
  it('1단계 정산조건이 먼저 보인다 (수수료 입력칸은 2단계로 이동해야 보임)', () => {
    render(<BidWizard rfp={rfp} buyerName="토스" />);
    expect(screen.getByText('정산 주기 *')).toBeInTheDocument();
    expect(screen.queryByText(/카드 수수료/)).not.toBeInTheDocument();
  });

  it('단계 이동 후 입력 → 발송 → submitBidAction 호출 + /submitted 이동', async () => {
    const user = userEvent.setup();
    render(<BidWizard rfp={rfp} buyerName="토스" />);

    // step1: 정산주기
    await user.clear(screen.getByPlaceholderText('1'));
    await user.type(screen.getByPlaceholderText('1'), '1');
    await user.click(screen.getByRole('button', { name: '수수료' }));

    // step2: 카드 수수료
    await user.type(feeInput('카드 수수료'), '1.5');
    await user.click(screen.getByRole('button', { name: '견적서' }));

    // step3 → step4
    await user.click(screen.getByRole('button', { name: '검토·발송' }));

    // step4: 발송 → 확인 다이얼로그 → 확인
    await user.click(screen.getByRole('button', { name: '견적 보내기' }));
    await user.click(screen.getByRole('button', { name: '견적 보내기', hidden: false }));

    await waitFor(() => expect(submitBidMock).toHaveBeenCalledTimes(1));
    expect(submitBidMock.mock.calls[0][0]).toMatchObject({
      rfpId: 'rfp-uuid',
      settleCycle: 'D+1',
      paymentFees: { card: 0.015 },
    });
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/inbox/P-2606-0001/submitted'));
  });
});
