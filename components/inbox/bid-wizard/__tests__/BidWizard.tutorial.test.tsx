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
const { saveQuoteTemplateActionMock } = vi.hoisted(() => ({
  saveQuoteTemplateActionMock: vi.fn(async () => ({ ok: true as const, templateId: 't1' })),
}));
vi.mock('@/lib/server/actions/quote-template/saveQuoteTemplateAction', () => ({
  saveQuoteTemplateAction: saveQuoteTemplateActionMock,
}));
const toastMock = vi.fn();
vi.mock('@/lib/toast', () => ({ toast: (...args: unknown[]) => toastMock(...args) }));
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
  toastMock.mockClear();
  saveQuoteTemplateActionMock.mockClear();
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

  it('푸터 다음 버튼에 스텝별 tutorial-bid-next-N 앵커가 붙는다', async () => {
    const user = userEvent.setup();
    render(<BidWizard rfp={rfp} buyerName="튜토리얼 쇼핑몰" />);
    expect(document.querySelector('[data-coachmark="tutorial-bid-next-1"]')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '수수료' }));
    expect(document.querySelector('[data-coachmark="tutorial-bid-next-2"]')).toBeInTheDocument();
    expect(document.querySelector('[data-coachmark="tutorial-bid-next-1"]')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '견적서' }));
    expect(document.querySelector('[data-coachmark="tutorial-bid-next-3"]')).toBeInTheDocument();
  });

  it('저장된 초안이 initialDraft 시드와 동일하면 복원 토스트를 띄우지 않는다 (baseline이 시드)', async () => {
    const { tutorialBidDraftSeed } = await import('@/lib/onboarding/tutorial-fixtures');
    localStorage.setItem('bid-draft:tutorial-rfp', JSON.stringify(tutorialBidDraftSeed));
    render(<BidWizard rfp={rfp} buyerName="튜토리얼 쇼핑몰" initialDraft={tutorialBidDraftSeed} />);
    expect(toastMock).not.toHaveBeenCalledWith(
      '이전에 작성하던 내용을 그대로 불러왔어요',
      expect.anything(),
    );
  });

  it('저장된 초안이 initialDraft와 다르면 초안이 이긴다 (복원 우선 계약 — clearStoredBidDraft의 존재 이유)', async () => {
    const { tutorialBidDraftSeed } = await import('@/lib/onboarding/tutorial-fixtures');
    const divergent = { ...tutorialBidDraftSeed, memo: '과거에 타이핑한 내용', cycleNum: '7' };
    localStorage.setItem('bid-draft:tutorial-rfp', JSON.stringify(divergent));
    render(<BidWizard rfp={rfp} buyerName="튜토리얼 쇼핑몰" initialDraft={tutorialBidDraftSeed} />);

    // 정산주기 입력이 시드(2)가 아니라 저장 초안(7)에서 온다 + 복원 토스트 발화.
    expect(screen.getByDisplayValue('7')).toBeInTheDocument();
    expect(toastMock).toHaveBeenCalledWith(
      '이전에 작성하던 내용을 그대로 불러왔어요',
      expect.anything(),
    );
  });

  it('onSampleSubmit 모드에서 템플릿 저장은 실 액션을 부르지 않고 안내 토스트만 띄운다', async () => {
    const user = userEvent.setup();
    render(<BidWizard rfp={rfp} buyerName="튜토리얼 쇼핑몰" onSampleSubmit={() => {}} />);

    // 4단계(검토·발송)로 이동 — 푸터 "다음" 버튼을 순서대로(기존 테스트와 동일 패턴).
    await user.click(screen.getByRole('button', { name: '수수료' }));
    await user.click(screen.getByRole('button', { name: '견적서' }));
    await user.click(screen.getByRole('button', { name: '검토·발송' }));

    // 템플릿 저장 폼 오픈
    await user.click(screen.getByRole('button', { name: '템플릿으로 저장' }));
    await user.type(screen.getByPlaceholderText('템플릿 이름'), '내 템플릿');
    await user.click(screen.getByRole('button', { name: '저장' }));

    expect(saveQuoteTemplateActionMock).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith('튜토리얼에서는 저장되지 않아요');
  });
});
