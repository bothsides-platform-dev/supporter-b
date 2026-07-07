import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

const updateOnboardingActionMock = vi.fn(async (_input: unknown) => ({ ok: true as const }));
vi.mock('@/lib/server/actions/onboarding/updateOnboardingAction', () => ({
  updateOnboardingAction: (input: unknown) => updateOnboardingActionMock(input),
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

vi.mock('../InviteScene', () => ({
  InviteScene: ({ onProceed }: { onProceed: () => void }) => (
    <div>
      <span>INVITE</span>
      <button type="button" onClick={onProceed}>invite-proceed</button>
    </div>
  ),
}));

vi.mock('@/components/inbox/RfpBriefPanel', () => ({
  RfpBriefPanel: () => <div>BRIEF</div>,
}));

vi.mock('@/components/inbox/bid-wizard/BidWizard', () => ({
  BidWizard: ({
    onSampleSubmit,
    onStepChange,
  }: {
    onSampleSubmit?: () => void;
    onStepChange?: (step: number) => void;
  }) => (
    <div>
      <span>WRITE</span>
      <button type="button" onClick={onSampleSubmit}>bid-submit</button>
      <button type="button" onClick={() => onStepChange?.(4)}>bid-goto-step4</button>
    </div>
  ),
}));

import { PgTutorialFlow } from '../PgTutorialFlow';

afterEach(cleanup);

describe('PgTutorialFlow (pg 튜토리얼 여정)', () => {
  beforeEach(() => {
    mockPush.mockClear();
    updateOnboardingActionMock.mockClear();
    confettiFireMock.mockClear();
  });

  it('초기 phase는 invite — 초대 연출과 1/4 진행 표시를 렌더한다', () => {
    render(<PgTutorialFlow />);
    expect(screen.getByText('INVITE')).toBeInTheDocument();
    expect(screen.getByText(/1\s*\/\s*4/)).toBeInTheDocument();
  });

  it('초대 확인 → brief phase(2/4) → 작성하기 → write phase(3/4)', async () => {
    const user = userEvent.setup();
    render(<PgTutorialFlow />);

    await user.click(screen.getByRole('button', { name: 'invite-proceed' }));
    expect(screen.getByText('BRIEF')).toBeInTheDocument();
    expect(screen.getByText(/2\s*\/\s*4/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '견적 작성하기' }));
    expect(screen.getByText('WRITE')).toBeInTheDocument();
    expect(screen.getByText(/3\s*\/\s*4/)).toBeInTheDocument();
  });

  it('견적 제출 시 completed 스탬프 + done phase(4/4)로 전환한다', async () => {
    const user = userEvent.setup();
    render(<PgTutorialFlow />);
    await user.click(screen.getByRole('button', { name: 'invite-proceed' }));
    await user.click(screen.getByRole('button', { name: '견적 작성하기' }));
    await user.click(screen.getByRole('button', { name: 'bid-submit' }));

    expect(updateOnboardingActionMock).toHaveBeenCalledWith({
      key: 'pgTutorial',
      event: 'completed',
    });
    expect(screen.getByText(/4\s*\/\s*4/)).toBeInTheDocument();
  });

  it('컨페티 캔버스는 done phase에서만 마운트된다 (훅이 마운트 시 자동 발사하는 계약)', async () => {
    const user = userEvent.setup();
    const { container } = render(<PgTutorialFlow />);
    expect(container.querySelector('canvas')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'invite-proceed' }));
    await user.click(screen.getByRole('button', { name: '견적 작성하기' }));
    expect(container.querySelector('canvas')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'bid-submit' }));
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('done phase는 봉인 입찰(경쟁사 비공개) 안내와 "받은 견적 요청 보기"·"홈으로" 버튼을 보여준다', async () => {
    const user = userEvent.setup();
    render(<PgTutorialFlow />);
    await user.click(screen.getByRole('button', { name: 'invite-proceed' }));
    await user.click(screen.getByRole('button', { name: '견적 작성하기' }));
    await user.click(screen.getByRole('button', { name: 'bid-submit' }));

    expect(screen.getByText(/공개되지 않아요/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '받은 견적 요청 보기' }));
    expect(mockPush).toHaveBeenCalledWith('/inbox');
  });

  it('done phase에서 "홈으로" 클릭 시 /home으로 이동한다', async () => {
    const user = userEvent.setup();
    render(<PgTutorialFlow />);
    await user.click(screen.getByRole('button', { name: 'invite-proceed' }));
    await user.click(screen.getByRole('button', { name: '견적 작성하기' }));
    await user.click(screen.getByRole('button', { name: 'bid-submit' }));

    await user.click(screen.getByRole('button', { name: '홈으로' }));
    expect(mockPush).toHaveBeenCalledWith('/home');
  });

  it('"튜토리얼 나가기" 클릭 시 dismissed 스탬프 + /home 이동', async () => {
    const user = userEvent.setup();
    render(<PgTutorialFlow />);

    await user.click(screen.getByRole('button', { name: '튜토리얼 나가기' }));

    expect(updateOnboardingActionMock).toHaveBeenCalledWith({
      key: 'pgTutorial',
      event: 'dismissed',
    });
    expect(mockPush).toHaveBeenCalledWith('/home');
  });

  it('brief 진입 시 요청 조건 투어를 표시한다', async () => {
    const user = userEvent.setup();
    render(<PgTutorialFlow />);
    await user.click(screen.getByRole('button', { name: 'invite-proceed' }));
    expect(screen.getByTestId('tour-tutorial-brief-panel')).toBeInTheDocument();
  });

  it('write 진입 시 콘텐츠 투어만 표시하고, 4단계 도달 시 제출 투어를 표시한다', async () => {
    const user = userEvent.setup();
    render(<PgTutorialFlow />);
    await user.click(screen.getByRole('button', { name: 'invite-proceed' }));
    await user.click(screen.getByRole('button', { name: '견적 작성하기' }));

    expect(screen.getByTestId('tour-tutorial-bid-form')).toBeInTheDocument();
    expect(screen.queryByTestId('tour-tutorial-bid-submit')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'tour-finish-tutorial-bid-form' }));
    await user.click(screen.getByRole('button', { name: 'bid-goto-step4' }));
    expect(screen.getByTestId('tour-tutorial-bid-submit')).toBeInTheDocument();
  });
});
