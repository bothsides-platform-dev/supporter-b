import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const updateOnboardingMock = vi.fn(async (_i: unknown) => ({ ok: true as const }));
vi.mock('@/lib/server/actions/onboarding/updateOnboardingAction', () => ({
  updateOnboardingAction: (i: unknown) => updateOnboardingMock(i),
}));

vi.mock('@/components/inbox/RfpBriefPanel', () => ({
  RfpBriefPanel: ({ buyerName }: { buyerName: string }) => <div>요청조건:{buyerName}</div>,
}));

const submitBidActionMock = vi.fn();
vi.mock('@/lib/server/actions/bid', () => ({ submitBidAction: (...a: unknown[]) => submitBidActionMock(...a) }));

vi.mock('@/components/inbox/bid-wizard/BidWizard', () => ({
  BidWizard: ({ onSampleSubmit }: { onSampleSubmit?: () => void }) => (
    <button onClick={onSampleSubmit}>견적 제출(mock)</button>
  ),
}));

vi.mock('../SamplePgResultScreen', () => ({
  SamplePgResultScreen: ({ buyerName }: { buyerName: string }) => <div>결과화면:{buyerName}</div>,
}));

import { SamplePgDealRoom } from '../SamplePgDealRoom';
import { sampleBuyerName } from '@/lib/onboarding/fixtures';

afterEach(() => {
  cleanup();
  updateOnboardingMock.mockClear();
  submitBidActionMock.mockClear();
});

describe('SamplePgDealRoom', () => {
  it('견적 작성 탭(BidWizard)과 요청 조건 탭(RfpBriefPanel)을 전환할 수 있다', async () => {
    const user = userEvent.setup();
    render(<SamplePgDealRoom />);
    expect(screen.getByText('견적 제출(mock)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '요청 보기' }));
    expect(screen.getByText(`요청조건:${sampleBuyerName}`)).toBeInTheDocument();
  });

  it('샘플 제출 시 실제 submitBidAction 없이 결과 화면으로 전환하고 온보딩 완료를 기록한다', async () => {
    const user = userEvent.setup();
    render(<SamplePgDealRoom />);
    await user.click(screen.getByText('견적 제출(mock)'));

    expect(submitBidActionMock).not.toHaveBeenCalled();
    expect(updateOnboardingMock).toHaveBeenCalledWith({ key: 'pgSample', event: 'completed' });
    expect(screen.getByText(`결과화면:${sampleBuyerName}`)).toBeInTheDocument();
  });
});
