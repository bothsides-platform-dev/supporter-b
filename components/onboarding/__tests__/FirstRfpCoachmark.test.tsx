import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const updateOnboardingActionMock = vi.fn(async (_input: unknown) => ({ ok: true as const }));
vi.mock('@/lib/server/actions/onboarding/updateOnboardingAction', () => ({
  updateOnboardingAction: (input: unknown) => updateOnboardingActionMock(input),
}));

vi.mock('@/components/onboarding/coachmarks', () => ({
  CoachmarkTour: ({
    steps,
    onFinish,
    onSkip,
  }: {
    steps: { target: string; kind?: string; placement: string; title: string; body: string }[];
    onFinish?: () => void;
    onSkip?: () => void;
  }) => (
    <div data-testid="tour" data-steps={JSON.stringify(steps)}>
      <button type="button" onClick={onFinish}>tour-finish</button>
      <button type="button" onClick={onSkip}>tour-skip</button>
    </div>
  ),
}));

import { FirstRfpCoachmark } from '../FirstRfpCoachmark';

afterEach(cleanup);

describe('FirstRfpCoachmark', () => {
  beforeEach(() => {
    updateOnboardingActionMock.mockClear();
  });

  it('CoachmarkTour에 단일 action step(home-create-rfp, bottom)을 전달한다', () => {
    render(<FirstRfpCoachmark />);
    const tour = screen.getByTestId('tour');
    const steps = JSON.parse(tour.getAttribute('data-steps') ?? '[]');
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({
      target: 'home-create-rfp',
      kind: 'action',
      placement: 'bottom',
      title: '견적 요청을 시작해요',
      body: '3분이면 보낼 수 있어요. 보내고 나면 여러 PG사의 견적을 한 곳에서 비교할 수 있어요.',
    });
  });

  it('onFinish 발화 시 completed를 스탬프한다', async () => {
    const user = userEvent.setup();
    render(<FirstRfpCoachmark />);
    await user.click(screen.getByRole('button', { name: 'tour-finish' }));
    expect(updateOnboardingActionMock).toHaveBeenCalledWith({
      key: 'buyerFirstRfp',
      event: 'completed',
    });
  });

  it('onFinish가 중복 발화해도 스탬프는 1회만 보낸다', async () => {
    const user = userEvent.setup();
    render(<FirstRfpCoachmark />);
    await user.click(screen.getByRole('button', { name: 'tour-finish' }));
    await user.click(screen.getByRole('button', { name: 'tour-finish' }));
    expect(updateOnboardingActionMock).toHaveBeenCalledTimes(1);
  });

  it('onSkip 발화 시 dismissed를 스탬프하고 코치마크를 즉시 숨긴다', async () => {
    const user = userEvent.setup();
    render(<FirstRfpCoachmark />);
    await user.click(screen.getByRole('button', { name: 'tour-skip' }));
    expect(updateOnboardingActionMock).toHaveBeenCalledWith({
      key: 'buyerFirstRfp',
      event: 'dismissed',
    });
    expect(screen.queryByTestId('tour')).not.toBeInTheDocument();
  });
});
