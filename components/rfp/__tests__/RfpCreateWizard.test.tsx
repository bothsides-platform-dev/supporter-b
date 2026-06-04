// components/rfp/__tests__/RfpCreateWizard.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RfpCreateWizard } from '../RfpCreateWizard';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';

// Step child component mocks — keeps wizard tests focused on orchestration logic
vi.mock('../RfpStep1BizProfile', () => ({
  RfpStep1BizProfile: ({ onNext }: { onNext: () => void }) => (
    <div>
      <span>사업자 확인</span>
      <button type="button" onClick={onNext}>다음</button>
    </div>
  ),
}));

vi.mock('../RfpStep2Content', () => ({
  RfpStep2Content: ({ onBack, onNext }: { onBack: () => void; onNext: () => void }) => (
    <div>
      <input placeholder="2026 서포트쇼핑몰 결제 인프라 제안건" />
      <button type="button" onClick={onBack}>이전</button>
      <button type="button" onClick={onNext}>다음</button>
    </div>
  ),
}));

vi.mock('../RfpStep3PgSelect', () => ({
  RfpStep3PgSelect: ({ onBack, onNext }: { pgList: unknown[]; onBack: () => void; onNext: () => void }) => (
    <div>
      <button type="button" onClick={onBack}>이전</button>
      <button type="button" onClick={onNext}>다음</button>
    </div>
  ),
}));

vi.mock('../RfpStep4Review', () => ({
  RfpStep4Review: ({
    onBack,
    onSubmit,
    submitting,
    serverError,
  }: {
    onBack: () => void;
    onSubmit: () => Promise<void>;
    submitting: boolean;
    serverError: string;
  }) => {
    const draft = useRfpDraftStore();
    const pgCount = draft.allowedPgWorkspaceIds.length;
    return (
      <div>
        {serverError && <p role="alert">{serverError}</p>}
        <button type="button" onClick={onBack}>이전</button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
        >
          {submitting ? '발송 중…' : pgCount > 0 ? `${pgCount}개 PG사에 발송` : '발송'}
        </button>
      </div>
    );
  },
}));

// Server action mock
vi.mock('@/lib/server/actions/rfp', () => ({
  createRfpAction: vi.fn(),
}));

// Toast mock
vi.mock('@/lib/toast', () => ({
  toast: vi.fn(),
}));

// Router mock
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

import { createRfpAction } from '@/lib/server/actions/rfp';
import { toast } from '@/lib/toast';

function resetStore() {
  useRfpDraftStore.setState({
    title: '',
    deadline: '',
    allowedPgWorkspaceIds: [],
    rfpFiles: [],
    websiteUrl: '',
    mainProducts: '',
    annualPgVolume: '',
    currentFeeRate: '',
    currentSettlementLimit: '',
    currentGuaranteeInsurance: '',
    currentSolution: '',
    currentSolutionDetail: '',
    memo: '',
  });
}

describe('RfpCreateWizard', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('초기 렌더 시 Step 1이 표시된다', () => {
    render(<RfpCreateWizard pgList={[]} />);
    expect(screen.getAllByText('사업자 확인').length).toBeGreaterThan(0);
    expect(screen.queryByPlaceholderText(/서포트쇼핑몰/)).not.toBeInTheDocument();
  });

  it('Step 1에서 다음 클릭 시 Step 2로 이동한다', async () => {
    const user = userEvent.setup();
    render(<RfpCreateWizard pgList={[]} />);
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByPlaceholderText(/서포트쇼핑몰/)).toBeInTheDocument();
  });

  it('사이드바에서 미도달 단계로 자유롭게 점프할 수 있다 (Step 1 → Step 4)', async () => {
    const user = userEvent.setup();
    render(<RfpCreateWizard pgList={[]} />);
    // Step 1에서 바로 '보내기 확인'(Step 4) 클릭 → 리뷰 단계로 점프
    await user.click(screen.getByText('보내기 확인'));
    expect(screen.getByRole('button', { name: '발송' })).toBeInTheDocument();
  });

  it('Step 2에서 이전 클릭 시 Step 1로 돌아간다', async () => {
    const user = userEvent.setup();
    render(<RfpCreateWizard pgList={[]} />);
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '이전' }));
    expect(screen.queryByPlaceholderText(/서포트쇼핑몰/)).not.toBeInTheDocument();
  });

  it('발송 성공 시 toast를 호출하고 /rfp/[code]로 이동한다', async () => {
    vi.mocked(createRfpAction).mockResolvedValue({ ok: true, rfpId: 'P-2606-0042' });
    useRfpDraftStore.setState({
      title: '테스트',
      deadline: '2026-06-30T23:59:59Z',
      allowedPgWorkspaceIds: [{ id: 'pg-1', displayName: '나이스' }],
    });
    const user = userEvent.setup();
    render(<RfpCreateWizard pgList={[]} />);

    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '1개 PG사에 발송' }));

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(
        expect.stringContaining('1개 PG사'),
        { type: 'success' },
      );
      expect(mockPush).toHaveBeenCalledWith('/rfp/P-2606-0042');
    });
  });

  it('guest 모드에서 발송 시 /signup/buyer로 이동한다', async () => {
    useRfpDraftStore.setState({
      title: '테스트',
      deadline: '2026-06-30T23:59:59Z',
      allowedPgWorkspaceIds: [{ id: 'pg-1', displayName: '나이스' }],
    });
    const localStorageSpy = vi.spyOn(Storage.prototype, 'setItem');
    const user = userEvent.setup();
    render(<RfpCreateWizard pgList={[]} guest />);

    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '1개 PG사에 발송' }));

    expect(localStorageSpy).toHaveBeenCalledWith('supporter-b-rfp-next', '/rfp/new');
    expect(mockPush).toHaveBeenCalledWith('/signup/buyer');
    expect(createRfpAction).not.toHaveBeenCalled();

    localStorageSpy.mockRestore();
  });

  it('필수값 미충족 상태에서 발송 클릭 시 토스트로 안내하고 해당 step으로 이동하며 createRfpAction을 호출하지 않는다', async () => {
    const user = userEvent.setup();
    // store는 빈 상태(resetStore) — 제목/PG/마감일 모두 비어있음
    render(<RfpCreateWizard pgList={[]} />);

    // 순서 무관 자유 이동: Step1 → 4까지 다음으로 이동
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '다음' }));
    // Step 4 발송 버튼 클릭 (미충족이라도 클릭 가능)
    await user.click(screen.getByRole('button', { name: '발송' }));

    expect(toast).toHaveBeenCalledWith(
      expect.stringContaining('제목'),
      { type: 'error' },
    );
    expect(createRfpAction).not.toHaveBeenCalled();
    // 첫 미충족 step(Step 2 제안 내용)으로 이동 → Step 2 입력 필드가 보인다
    expect(screen.getByPlaceholderText(/서포트쇼핑몰/)).toBeInTheDocument();
  });

  it('발송 실패 시 serverError를 표시한다', async () => {
    vi.mocked(createRfpAction).mockResolvedValue({ ok: false, error: 'INVALID_INPUT' });
    useRfpDraftStore.setState({
      title: '테스트',
      deadline: '2026-06-30T23:59:59Z',
      allowedPgWorkspaceIds: [{ id: 'pg-1', displayName: '나이스' }],
    });
    const user = userEvent.setup();
    render(<RfpCreateWizard pgList={[]} />);

    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '1개 PG사에 발송' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('INVALID_INPUT');
    });
  });
});
