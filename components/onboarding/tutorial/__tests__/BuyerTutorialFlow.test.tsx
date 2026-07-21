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

vi.mock('@/components/onboarding/coachmarks', async () => ({
  CoachmarkTour: (await import('./coachmark-tour-stub')).CoachmarkTourStub,
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

vi.mock('../TutorialLeaveGuard', () => ({
  TutorialLeaveGuard: () => <div data-testid="leave-guard" />,
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

  it('견적 선정 시 completed 스탬프 + done phase(4/4)로 전환한다', async () => {
    const user = userEvent.setup();
    render(<BuyerTutorialFlow />);
    await user.click(screen.getByRole('button', { name: 'wizard-submit' }));
    await user.click(screen.getByRole('button', { name: 'arrival-proceed' }));
    await user.click(screen.getByRole('button', { name: 'compare-award' }));

    expect(updateOnboardingActionMock).toHaveBeenCalledWith({
      key: 'buyerTutorial',
      event: 'completed',
    });
    expect(screen.getByText(/4\s*\/\s*4/)).toBeInTheDocument();
  });

  it('컨페티 캔버스는 done phase에서만 마운트된다 (훅이 마운트 시 자동 발사하는 계약)', async () => {
    const user = userEvent.setup();
    const { container } = render(<BuyerTutorialFlow />);
    expect(container.querySelector('canvas')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'wizard-submit' }));
    await user.click(screen.getByRole('button', { name: 'arrival-proceed' }));
    expect(container.querySelector('canvas')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'compare-award' }));
    expect(container.querySelector('canvas')).not.toBeNull();
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

  it('create phase에서 코치마크 건너뛰기 시 completed 스탬프 + done phase(4/4)로 점프한다', async () => {
    const user = userEvent.setup();
    render(<BuyerTutorialFlow />);

    await user.click(screen.getByRole('button', { name: 'tour-skip-tutorial-wizard-content' }));

    expect(updateOnboardingActionMock).toHaveBeenCalledWith({
      key: 'buyerTutorial',
      event: 'completed',
    });
    expect(screen.getByText('튜토리얼을 완료했어요')).toBeInTheDocument();
    expect(screen.getByText(/4\s*\/\s*4/)).toBeInTheDocument();
  });

  it('arrival phase에서 코치마크 건너뛰기 시 done phase로 점프한다', async () => {
    const user = userEvent.setup();
    render(<BuyerTutorialFlow />);
    await user.click(screen.getByRole('button', { name: 'wizard-submit' }));

    await user.click(screen.getByRole('button', { name: 'tour-skip-tutorial-arrival-cta' }));

    expect(updateOnboardingActionMock).toHaveBeenCalledWith({
      key: 'buyerTutorial',
      event: 'completed',
    });
    expect(screen.getByText(/4\s*\/\s*4/)).toBeInTheDocument();
  });

  it('compare phase(마지막 단계)에서 코치마크 건너뛰기 시에도 done phase로 점프한다', async () => {
    const user = userEvent.setup();
    render(<BuyerTutorialFlow />);
    await user.click(screen.getByRole('button', { name: 'wizard-submit' }));
    await user.click(screen.getByRole('button', { name: 'arrival-proceed' }));

    await user.click(screen.getByRole('button', { name: 'tour-skip-tutorial-compare-header' }));

    expect(updateOnboardingActionMock).toHaveBeenCalledWith({
      key: 'buyerTutorial',
      event: 'completed',
    });
    expect(screen.getByText(/4\s*\/\s*4/)).toBeInTheDocument();
  });

  it('코치마크 자연 종료(onFinish)는 스탬프 없이 현재 phase에 머문다 (skip과 분기)', async () => {
    const user = userEvent.setup();
    render(<BuyerTutorialFlow />);

    await user.click(screen.getByRole('button', { name: 'tour-finish-tutorial-wizard-content' }));

    expect(updateOnboardingActionMock).not.toHaveBeenCalled();
    expect(screen.getByText('WIZARD')).toBeInTheDocument();
    expect(screen.getByText(/1\s*\/\s*4/)).toBeInTheDocument();
  });

  it('건너뛰기로 done 진입 시에도 컨페티 캔버스가 마운트된다', async () => {
    const user = userEvent.setup();
    const { container } = render(<BuyerTutorialFlow />);
    expect(container.querySelector('canvas')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'tour-skip-tutorial-wizard-content' }));

    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('건너뛰기로 done 진입 후 "실제 견적 요청 보내기" 클릭 시 draft를 복원하고 /rfp-create로 이동한다', async () => {
    const user = userEvent.setup();
    render(<BuyerTutorialFlow />);
    await user.click(screen.getByRole('button', { name: 'tour-skip-tutorial-wizard-content' }));

    await user.click(screen.getByRole('button', { name: '실제 견적 요청 보내기' }));

    expect(restoreMock).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/rfp-create');
  });

  it('건너뛰기로 done 진입 후 "홈으로" 클릭 시 draft를 복원하고 /home으로 이동한다', async () => {
    const user = userEvent.setup();
    render(<BuyerTutorialFlow />);
    await user.click(screen.getByRole('button', { name: 'tour-skip-tutorial-wizard-content' }));

    await user.click(screen.getByRole('button', { name: '홈으로' }));

    expect(restoreMock).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/home');
  });

  it('create 투어는 단일 연속 투어로 제출 버튼(tutorial-wizard-submit)에서 끝난다', () => {
    render(<BuyerTutorialFlow />);
    const tour = screen.getByTestId('tour-tutorial-wizard-content');
    const targets = (tour.getAttribute('data-targets') ?? '').split(',');
    expect(targets[targets.length - 1]).toBe('tutorial-wizard-submit');
    // 별도의 step-4 게이트 제출 투어는 더 이상 존재하지 않는다.
    expect(screen.queryByTestId('tour-tutorial-wizard-submit')).not.toBeInTheDocument();
  });

  it('arrival phase에서 arrival CTA 투어를 마운트한다', async () => {
    const user = userEvent.setup();
    render(<BuyerTutorialFlow />);
    await user.click(screen.getByRole('button', { name: 'wizard-submit' }));
    expect(screen.getByTestId('tour-tutorial-arrival-cta')).toBeInTheDocument();
  });

  it('이탈 가드는 phase!==done 동안 마운트되고, done phase에서는 사라진다', async () => {
    const user = userEvent.setup();
    render(<BuyerTutorialFlow />);
    expect(screen.getByTestId('leave-guard')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'wizard-submit' }));
    await user.click(screen.getByRole('button', { name: 'arrival-proceed' }));
    await user.click(screen.getByRole('button', { name: 'compare-award' }));

    expect(screen.queryByTestId('leave-guard')).not.toBeInTheDocument();
  });
});
