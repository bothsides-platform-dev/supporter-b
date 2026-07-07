import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

const updateOnboardingActionMock = vi.fn(async (_input: unknown) => ({ ok: true as const }));
vi.mock('@/lib/server/actions/onboarding/updateOnboardingAction', () => ({
  updateOnboardingAction: (input: unknown) => updateOnboardingActionMock(input),
}));

const restoreMock = vi.fn();
vi.mock('../useIsolatedRfpDraft', () => ({
  useIsolatedRfpDraft: () => ({ restore: restoreMock }),
}));

const confettiFireMock = vi.fn();
vi.mock('@/lib/hooks/useCelebrationConfetti', () => ({
  useCelebrationConfetti: () => ({ canvasRef: { current: null }, fire: confettiFireMock }),
}));

vi.mock('@/components/onboarding/coachmarks', () => ({
  CoachmarkTour: ({ steps, onFinish }: { steps: { target: string }[]; onFinish?: () => void }) => (
    <div data-testid={`tour-${steps[0]?.target}`}>
      <button type="button" onClick={onFinish}>{`tour-finish-${steps[0]?.target}`}</button>
    </div>
  ),
}));

vi.mock('@/components/rfp/RfpCreateWizard', () => ({
  RfpCreateWizard: ({
    onSampleSubmit,
    onStepChange,
  }: {
    onSampleSubmit?: () => void;
    onStepChange?: (step: number) => void;
  }) => (
    <div>
      <span>WIZARD</span>
      <button type="button" onClick={onSampleSubmit}>wizard-submit</button>
      <button type="button" onClick={() => onStepChange?.(4)}>wizard-goto-step4</button>
    </div>
  ),
}));

vi.mock('../BidsArrivalScene', () => ({
  BidsArrivalScene: ({ onProceed }: { onProceed: () => void }) => (
    <div>
      <span>ARRIVAL</span>
      <button type="button" onClick={onProceed}>arrival-proceed</button>
    </div>
  ),
}));

vi.mock('@/components/rfp/comparison/FocusComparison', () => ({
  FocusComparison: ({ onSampleAward }: { onSampleAward?: (bidId: string) => void }) => (
    <div>
      <span>COMPARE</span>
      <button type="button" onClick={() => onSampleAward?.('tutorial-bid-a')}>compare-award</button>
    </div>
  ),
}));

vi.mock('@/components/deal-room/DealRoomContext', () => ({
  DealRoomProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { BuyerTutorialFlow } from '../BuyerTutorialFlow';

afterEach(cleanup);

describe('BuyerTutorialFlow (buyer 튜토리얼 여정)', () => {
  beforeEach(() => {
    mockPush.mockClear();
    updateOnboardingActionMock.mockClear();
    restoreMock.mockClear();
    confettiFireMock.mockClear();
  });

  it('초기 phase는 create — 위저드와 1/4 진행 표시를 렌더한다', () => {
    render(<BuyerTutorialFlow />);
    expect(screen.getByText('WIZARD')).toBeInTheDocument();
    expect(screen.getByText(/1\s*\/\s*4/)).toBeInTheDocument();
  });

  it('위저드 제출 → arrival phase(2/4) → 도착 연출 완료 → compare phase(3/4)', async () => {
    const user = userEvent.setup();
    render(<BuyerTutorialFlow />);

    await user.click(screen.getByRole('button', { name: 'wizard-submit' }));
    expect(screen.getByText('ARRIVAL')).toBeInTheDocument();
    expect(screen.getByText(/2\s*\/\s*4/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'arrival-proceed' }));
    expect(screen.getByText('COMPARE')).toBeInTheDocument();
    expect(screen.getByText(/3\s*\/\s*4/)).toBeInTheDocument();
  });

  it('견적 선정 시 컨페티 발사 + completed 스탬프 + done phase(4/4)로 전환한다', async () => {
    const user = userEvent.setup();
    render(<BuyerTutorialFlow />);
    await user.click(screen.getByRole('button', { name: 'wizard-submit' }));
    await user.click(screen.getByRole('button', { name: 'arrival-proceed' }));
    await user.click(screen.getByRole('button', { name: 'compare-award' }));

    expect(confettiFireMock).toHaveBeenCalled();
    expect(updateOnboardingActionMock).toHaveBeenCalledWith({
      key: 'buyerTutorial',
      event: 'completed',
    });
    expect(screen.getByText(/4\s*\/\s*4/)).toBeInTheDocument();
  });

  it('done phase에서 "실제 견적 요청 보내기" 클릭 시 draft를 복원하고 /rfp-create로 이동한다', async () => {
    const user = userEvent.setup();
    render(<BuyerTutorialFlow />);
    await user.click(screen.getByRole('button', { name: 'wizard-submit' }));
    await user.click(screen.getByRole('button', { name: 'arrival-proceed' }));
    await user.click(screen.getByRole('button', { name: 'compare-award' }));

    await user.click(screen.getByRole('button', { name: '실제 견적 요청 보내기' }));
    expect(restoreMock).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/rfp-create');
  });

  it('"튜토리얼 나가기" 클릭 시 dismissed 스탬프 + draft 복원 + /home 이동', async () => {
    const user = userEvent.setup();
    render(<BuyerTutorialFlow />);

    await user.click(screen.getByRole('button', { name: '튜토리얼 나가기' }));

    expect(updateOnboardingActionMock).toHaveBeenCalledWith({
      key: 'buyerTutorial',
      event: 'dismissed',
    });
    expect(restoreMock).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/home');
  });

  it('create 진입 시 콘텐츠 투어만 표시하고 제출 투어는 표시하지 않는다', () => {
    render(<BuyerTutorialFlow />);
    expect(screen.getByTestId('tour-tutorial-wizard-content')).toBeInTheDocument();
    expect(screen.queryByTestId('tour-tutorial-wizard-submit')).not.toBeInTheDocument();
  });

  it('콘텐츠 투어 종료 후 위저드 4단계 도달 시 제출 투어를 표시한다', async () => {
    const user = userEvent.setup();
    render(<BuyerTutorialFlow />);

    await user.click(screen.getByText('tour-finish-tutorial-wizard-content'));
    expect(screen.queryByTestId('tour-tutorial-wizard-submit')).not.toBeInTheDocument();

    await user.click(screen.getByText('wizard-goto-step4'));
    expect(screen.getByTestId('tour-tutorial-wizard-submit')).toBeInTheDocument();
  });
});
