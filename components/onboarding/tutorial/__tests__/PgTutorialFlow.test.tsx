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
  CoachmarkTour: ({
    steps,
    onFinish,
    onSkip,
  }: {
    steps: { target: string }[];
    onFinish?: () => void;
    onSkip?: () => void;
  }) => (
    <div
      data-testid={`tour-${steps[0]?.target}`}
      data-targets={steps.map((s) => s.target).join(',')}
    >
      <button type="button" onClick={onFinish}>{`tour-finish-${steps[0]?.target}`}</button>
      <button type="button" onClick={onSkip}>{`tour-skip-${steps[0]?.target}`}</button>
    </div>
  ),
}));

const keyboardLockMock = vi.fn();
vi.mock('../useTutorialKeyboardLock', () => ({
  useTutorialKeyboardLock: () => keyboardLockMock(),
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

const bidWizardPropsSpy = vi.fn();
vi.mock('@/components/inbox/bid-wizard/BidWizard', () => ({
  BidWizard: (props: { onSampleSubmit?: () => void; initialDraft?: unknown }) => {
    bidWizardPropsSpy(props);
    return (
      <div>
        <span>WRITE</span>
        <button type="button" onClick={props.onSampleSubmit}>bid-submit</button>
      </div>
    );
  },
}));

import { PgTutorialFlow } from '../PgTutorialFlow';
import { tutorialBidDraftSeed } from '@/lib/onboarding/tutorial-fixtures';

afterEach(cleanup);

describe('PgTutorialFlow (pg 튜토리얼 여정)', () => {
  beforeEach(() => {
    mockPush.mockClear();
    updateOnboardingActionMock.mockClear();
    confettiFireMock.mockClear();
    bidWizardPropsSpy.mockClear();
    keyboardLockMock.mockClear();
    localStorage.clear();
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

  it('invite phase에서 코치마크 건너뛰기 시 completed 스탬프 + done phase(4/4)로 점프한다', async () => {
    const user = userEvent.setup();
    render(<PgTutorialFlow />);

    await user.click(screen.getByRole('button', { name: 'tour-skip-tutorial-invite-cta' }));

    expect(updateOnboardingActionMock).toHaveBeenCalledWith({
      key: 'pgTutorial',
      event: 'completed',
    });
    expect(screen.getByText('튜토리얼을 완료했어요')).toBeInTheDocument();
    expect(screen.getByText(/4\s*\/\s*4/)).toBeInTheDocument();
  });

  it('brief phase에서 코치마크 건너뛰기 시 done phase로 점프한다', async () => {
    const user = userEvent.setup();
    render(<PgTutorialFlow />);
    await user.click(screen.getByRole('button', { name: 'invite-proceed' }));

    await user.click(screen.getByRole('button', { name: 'tour-skip-tutorial-brief-panel' }));

    expect(updateOnboardingActionMock).toHaveBeenCalledWith({
      key: 'pgTutorial',
      event: 'completed',
    });
    expect(screen.getByText(/4\s*\/\s*4/)).toBeInTheDocument();
  });

  it('brief 진입 시 요청 조건 투어를 표시한다', async () => {
    const user = userEvent.setup();
    render(<PgTutorialFlow />);
    await user.click(screen.getByRole('button', { name: 'invite-proceed' }));
    expect(screen.getByTestId('tour-tutorial-brief-panel')).toBeInTheDocument();
  });

  it('invite 진입 시 초대 CTA 투어를 표시한다', () => {
    render(<PgTutorialFlow />);
    expect(screen.getByTestId('tour-tutorial-invite-cta')).toBeInTheDocument();
  });

  it('write 투어는 단일 연속 투어로 제출 버튼(tutorial-bid-submit)에서 끝난다', async () => {
    const user = userEvent.setup();
    render(<PgTutorialFlow />);
    await user.click(screen.getByRole('button', { name: 'invite-proceed' }));
    await user.click(screen.getByRole('button', { name: '견적 작성하기' }));

    const tour = screen.getByTestId('tour-tutorial-bid-form');
    const targets = (tour.getAttribute('data-targets') ?? '').split(',');
    expect(targets[targets.length - 1]).toBe('tutorial-bid-submit');
    // 별도의 step-4 게이트 제출 투어는 더 이상 존재하지 않는다.
    expect(screen.queryByTestId('tour-tutorial-bid-submit')).not.toBeInTheDocument();
  });

  it('BidWizard에 tutorialBidDraftSeed를 initialDraft로 전달한다 (타이핑 제로 프리필)', async () => {
    const user = userEvent.setup();
    render(<PgTutorialFlow />);
    await user.click(screen.getByRole('button', { name: 'invite-proceed' }));
    await user.click(screen.getByRole('button', { name: '견적 작성하기' }));

    expect(bidWizardPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ initialDraft: tutorialBidDraftSeed }),
    );
  });

  it('견적 작성하기 클릭 시 과거 튜토리얼의 잔존 draft를 지운다 (시드가 항상 이기도록)', async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      'bid-draft:tutorial-rfp',
      JSON.stringify({ ...tutorialBidDraftSeed, memo: '과거에 타이핑한 내용' }),
    );
    render(<PgTutorialFlow />);
    await user.click(screen.getByRole('button', { name: 'invite-proceed' }));
    await user.click(screen.getByRole('button', { name: '견적 작성하기' }));

    expect(localStorage.getItem('bid-draft:tutorial-rfp')).toBeNull();
  });

  it('튜토리얼 전 구간에서 키보드 락이 마운트된다 (클릭 전용)', () => {
    render(<PgTutorialFlow />);
    expect(keyboardLockMock).toHaveBeenCalled();
  });
});
