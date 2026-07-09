import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
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

vi.mock('@/lib/server/actions/bid', () => ({
  submitBidAction: vi.fn(async () => ({ ok: true as const, bidId: 'b1' })),
}));
vi.mock('@/lib/server/actions/quote-template/saveQuoteTemplateAction', () => ({
  saveQuoteTemplateAction: vi.fn(async () => ({ ok: true as const, templateId: 't1' })),
}));
vi.mock('../../RfpBriefPanel', () => ({ RfpBriefPanel: () => <div /> }));
vi.mock('@/components/messages/CounterpartyProfileCard', () => ({
  CounterpartyProfileCard: ({ counterparty }: { counterparty: { name: string } }) => (
    <span>{counterparty.name}</span>
  ),
}));

import { BidWizard } from '../BidWizard';

const rfp = {
  id: 'tutorial-rfp',
  code: 'TUTORIAL',
  requiredPaymentMethods: ['card'] as PaymentMethod[],
  customPaymentMethods: [],
} as never;

beforeEach(() => {
  localStorage.clear();
});
afterEach(cleanup);

describe('BidWizard 튜토리얼 코치마크 훅', () => {
  it('폼 콘텐츠 영역에 data-coachmark="tutorial-bid-form"이 있다', () => {
    render(<BidWizard rfp={rfp} buyerName="튜토리얼 쇼핑몰" />);
    expect(document.querySelector('[data-coachmark="tutorial-bid-form"]')).toBeInTheDocument();
  });

  it('1단계에서는 제출 버튼(tutorial-bid-submit)이 없고, 4단계(검토·발송) 도달 시에만 나타난다', async () => {
    const user = userEvent.setup();
    render(<BidWizard rfp={rfp} buyerName="튜토리얼 쇼핑몰" />);
    expect(document.querySelector('[data-coachmark="tutorial-bid-submit"]')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '수수료' }));
    await user.click(screen.getByRole('button', { name: '견적서' }));
    await user.click(screen.getByRole('button', { name: '검토·발송' }));

    expect(document.querySelector('[data-coachmark="tutorial-bid-submit"]')).toBeInTheDocument();
  });

  it('onStepChange가 주어지면 단계 이동마다 현재 단계 번호로 호출된다', async () => {
    const onStepChange = vi.fn();
    const user = userEvent.setup();
    render(<BidWizard rfp={rfp} buyerName="튜토리얼 쇼핑몰" onStepChange={onStepChange} />);
    expect(onStepChange).toHaveBeenCalledWith(1);

    await user.click(screen.getByRole('button', { name: '수수료' }));
    expect(onStepChange).toHaveBeenCalledWith(2);
  });
});
