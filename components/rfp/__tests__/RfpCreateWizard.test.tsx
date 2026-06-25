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
  verifyDraftFilesAction: vi.fn(),
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

import { createRfpAction, verifyDraftFilesAction } from '@/lib/server/actions/rfp';
import { toast } from '@/lib/toast';

// 기존 테스트에서 공통으로 쓰는 PG 픽스처
const PG_1 = { id: 'pg-1', name: '나이스', displayName: '나이스' };

function resetStore() {
  useRfpDraftStore.setState({
    title: '',
    deadline: '',
    allowedPgWorkspaceIds: [],
    rfpFiles: [],
    websiteUrl: '',
    requiredPaymentMethods: [],
    customPaymentMethods: [],
    mainProducts: '',
    annualPgVolume: '',
    currentFeeRate: '',
    currentSettlementLimit: '',
    currentGuaranteeInsurance: '',
    currentSettlementCycle: '',
    deliveryServicePeriod: '',
    currentSolution: '',
    currentSolutionDetail: '',
    memo: '',
    boardVisible: true,
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

  it('이전 step 모두 완료 시 사이드바에서 이후 step으로 이동할 수 있다', async () => {
    // Steps 1, 2, 3 완료 조건 충족 → 사이드바에서 Step 4로 바로 이동 가능
    useRfpDraftStore.setState({
      title: '테스트',
      websiteUrl: 'https://example.com',
      requiredPaymentMethods: ['card'],
      allowedPgWorkspaceIds: [{ id: 'pg-1', displayName: '나이스' }],
      deadline: '2026-06-30T23:59:59Z',
    });
    const user = userEvent.setup();
    render(<RfpCreateWizard pgList={[PG_1]} />);
    await user.click(screen.getByText('최종 견적 요청 정보 확인'));
    expect(screen.getByRole('button', { name: '1개 PG사에 발송' })).toBeInTheDocument();
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
      websiteUrl: 'https://example.com',
      requiredPaymentMethods: ['card'],
      deadline: '2026-06-30T23:59:59Z',
      allowedPgWorkspaceIds: [{ id: 'pg-1', displayName: '나이스' }],
    });
    const user = userEvent.setup();
    render(<RfpCreateWizard pgList={[PG_1]} />);

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
      websiteUrl: 'https://example.com',
      requiredPaymentMethods: ['card'],
      deadline: '2026-06-30T23:59:59Z',
      allowedPgWorkspaceIds: [{ id: 'pg-1', displayName: '나이스' }],
    });
    const localStorageSpy = vi.spyOn(Storage.prototype, 'setItem');
    const user = userEvent.setup();
    render(<RfpCreateWizard pgList={[PG_1]} guest />);

    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '1개 PG사에 발송' }));

    expect(localStorageSpy).toHaveBeenCalledWith('supporter-b-rfp-next', '/rfp-create');
    expect(mockPush).toHaveBeenCalledWith('/signup/buyer');
    expect(createRfpAction).not.toHaveBeenCalled();

    localStorageSpy.mockRestore();
  });

  it('마감일 미설정 상태에서 발송 클릭 시 토스트로 안내하고 createRfpAction을 호출하지 않는다', async () => {
    // Steps 1, 2, 3 완료 / Step 4(마감일) 미완료 — 순서 강제로 step 4까지 도달 가능
    useRfpDraftStore.setState({
      title: '테스트',
      websiteUrl: 'https://example.com',
      requiredPaymentMethods: ['card'],
      allowedPgWorkspaceIds: [{ id: 'pg-1', displayName: '나이스' }],
      // deadline 미설정 → Step 4 미완료
    });
    const user = userEvent.setup();
    render(<RfpCreateWizard pgList={[PG_1]} />);

    // Steps 1→2→3→4 (steps 1-3 유효 → advance() 통과)
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '1개 PG사에 발송' }));

    expect(toast).toHaveBeenCalledWith(
      expect.stringContaining('마감일'),
      { type: 'error' },
    );
    expect(createRfpAction).not.toHaveBeenCalled();
  });

  it('currentSettlementCycle과 deliveryServicePeriod를 createRfpAction에 전달한다', async () => {
    vi.mocked(createRfpAction).mockResolvedValue({ ok: true, rfpId: 'P-2606-0099' });
    useRfpDraftStore.setState({
      title: '테스트',
      websiteUrl: 'https://example.com',
      requiredPaymentMethods: ['card'],
      deadline: '2026-06-30T23:59:59Z',
      allowedPgWorkspaceIds: [{ id: 'pg-1', displayName: '나이스' }],
      currentSettlementCycle: 'D+2',
      deliveryServicePeriod: '3~5일',
    });
    const user = userEvent.setup();
    render(<RfpCreateWizard pgList={[PG_1]} />);

    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '1개 PG사에 발송' }));

    await waitFor(() => {
      expect(createRfpAction).toHaveBeenCalledWith(
        expect.objectContaining({
          currentSettlementCycle: 'D+2',
          deliveryServicePeriod: '3~5일',
        }),
      );
    });
  });

  it('boardVisible(오픈 게시판 노출 여부)를 createRfpAction에 전달한다', async () => {
    vi.mocked(createRfpAction).mockResolvedValue({ ok: true, rfpId: 'P-2606-0100' });
    useRfpDraftStore.setState({
      title: '테스트',
      websiteUrl: 'https://example.com',
      requiredPaymentMethods: ['card'],
      deadline: '2026-06-30T23:59:59Z',
      allowedPgWorkspaceIds: [{ id: 'pg-1', displayName: '나이스' }],
      boardVisible: false,
    });
    const user = userEvent.setup();
    render(<RfpCreateWizard pgList={[PG_1]} />);

    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '1개 PG사에 발송' }));

    await waitFor(() => {
      expect(createRfpAction).toHaveBeenCalledWith(
        expect.objectContaining({ boardVisible: false }),
      );
    });
  });

  it('contractType(신규/갱신)을 createRfpAction에 전달한다', async () => {
    vi.mocked(createRfpAction).mockResolvedValue({ ok: true, rfpId: 'P-2606-0101' });
    useRfpDraftStore.setState({
      title: '테스트',
      websiteUrl: 'https://example.com',
      requiredPaymentMethods: ['card'],
      deadline: '2026-06-30T23:59:59Z',
      allowedPgWorkspaceIds: [{ id: 'pg-1', displayName: '나이스' }],
      contractType: 'renewal',
    });
    const user = userEvent.setup();
    render(<RfpCreateWizard pgList={[PG_1]} />);

    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '1개 PG사에 발송' }));

    await waitFor(() => {
      expect(createRfpAction).toHaveBeenCalledWith(
        expect.objectContaining({ contractType: 'renewal' }),
      );
    });
  });

  it('발송 실패 시 serverError를 표시한다', async () => {
    vi.mocked(createRfpAction).mockResolvedValue({ ok: false, error: 'INVALID_INPUT' });
    useRfpDraftStore.setState({
      title: '테스트',
      websiteUrl: 'https://example.com',
      requiredPaymentMethods: ['card'],
      deadline: '2026-06-30T23:59:59Z',
      allowedPgWorkspaceIds: [{ id: 'pg-1', displayName: '나이스' }],
    });
    const user = userEvent.setup();
    render(<RfpCreateWizard pgList={[PG_1]} />);

    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '1개 PG사에 발송' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('INVALID_INPUT');
    });
  });

  // ── step 순서 강제 — advance() 게이트 ──────────────────────────────────

  it('Step 2 미완료(제목 없음) 시 다음 클릭은 step을 유지하고 hint toast를 표시한다', async () => {
    const user = userEvent.setup();
    render(<RfpCreateWizard pgList={[]} />);
    await user.click(screen.getByRole('button', { name: '다음' })); // Step 1 → 2 (항상 유효)
    await user.click(screen.getByRole('button', { name: '다음' })); // 차단: title 없음
    // 여전히 Step 2
    expect(screen.getByPlaceholderText(/서포트쇼핑몰/)).toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith('제목을 입력해주세요', { type: 'error' });
  });

  it('Step 3 미완료(PG 없음) 시 다음 클릭은 step을 유지하고 hint toast를 표시한다', async () => {
    useRfpDraftStore.setState({ title: '테스트 제안건', websiteUrl: 'https://example.com', requiredPaymentMethods: ['card'] });
    const user = userEvent.setup();
    render(<RfpCreateWizard pgList={[]} />);
    await user.click(screen.getByRole('button', { name: '다음' })); // → Step 2
    await user.click(screen.getByRole('button', { name: '다음' })); // → Step 3 (title 있음)
    await user.click(screen.getByRole('button', { name: '다음' })); // 차단: PG 없음
    // 여전히 Step 3 (Step 4 '발송' 버튼 없음)
    expect(screen.queryByRole('button', { name: '발송' })).not.toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith('PG를 1개 이상 선택해주세요', { type: 'error' });
  });

  // ── step 순서 강제 — goToStep() 게이트 (사이드바 클릭) ─────────────────

  it('이전 step 미완료 시 사이드바 클릭으로 이후 step 이동 불가 — toast 호출', async () => {
    const user = userEvent.setup();
    // store 비어있음 → Step 2 미완료(title 없음)
    render(<RfpCreateWizard pgList={[]} />);
    await user.click(screen.getByText('최종 견적 요청 정보 확인')); // goToStep(4) — Step 2 미완료라 차단
    expect(screen.queryByRole('button', { name: '발송' })).not.toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith('제목을 입력해주세요', { type: 'error' });
  });

  // ── Draft 재조정 — 마운트 시 stale 데이터 정리 ────────────────────────────

  describe('Draft 재조정', () => {
    beforeEach(() => {
      // 파일 없는 기본 케이스에서 verifyDraftFilesAction 호출 없도록
      vi.mocked(verifyDraftFilesAction).mockResolvedValue({ validIds: [] });
    });

    it('pgList에 없는 stale PG를 제거하고 warning toast를 표시한다', async () => {
      useRfpDraftStore.setState({
        allowedPgWorkspaceIds: [
          { id: 'pg-valid', displayName: '나이스' },
          { id: 'pg-stale', displayName: '구 PG사' },
        ],
      });
      render(
        <RfpCreateWizard
          pgList={[{ id: 'pg-valid', name: '나이스', displayName: '나이스' }]}
        />,
      );

      await waitFor(() => {
        const { allowedPgWorkspaceIds } = useRfpDraftStore.getState();
        expect(allowedPgWorkspaceIds).toHaveLength(1);
        expect(allowedPgWorkspaceIds[0].id).toBe('pg-valid');
      });
      expect(toast).toHaveBeenCalledWith(
        expect.stringContaining('1개 PG사'),
        { type: 'info' },
      );
    });

    it('모든 PG가 유효하면 PG 관련 warning을 표시하지 않는다', async () => {
      useRfpDraftStore.setState({
        allowedPgWorkspaceIds: [{ id: 'pg-valid', displayName: '나이스' }],
      });
      render(
        <RfpCreateWizard
          pgList={[{ id: 'pg-valid', name: '나이스', displayName: '나이스' }]}
        />,
      );

      // effect 실행 대기
      await waitFor(() => {});
      expect(toast).not.toHaveBeenCalledWith(
        expect.stringContaining('PG사'),
        expect.objectContaining({ type: 'warning' }),
      );
    });

    it('만료된 마감일을 초기화하고 warning toast를 표시한다', async () => {
      useRfpDraftStore.setState({ deadline: '2020-01-01T00:00:00Z' });
      render(<RfpCreateWizard pgList={[]} />);

      await waitFor(() => {
        expect(useRfpDraftStore.getState().deadline).toBe('');
      });
      expect(toast).toHaveBeenCalledWith(
        expect.stringContaining('마감일'),
        { type: 'info' },
      );
    });

    it('유효한 미래 마감일은 그대로 유지한다', async () => {
      useRfpDraftStore.setState({ deadline: '2099-01-01T00:00:00Z' });
      render(<RfpCreateWizard pgList={[]} />);

      await waitFor(() => {});
      expect(useRfpDraftStore.getState().deadline).toBe('2099-01-01T00:00:00Z');
      expect(toast).not.toHaveBeenCalledWith(
        expect.stringContaining('마감일'),
        expect.anything(),
      );
    });

    it('서버에 없는 stale 첨부파일을 제거하고 warning toast를 표시한다', async () => {
      vi.mocked(verifyDraftFilesAction).mockResolvedValue({ validIds: ['file-valid'] });
      useRfpDraftStore.setState({
        rfpFiles: [
          { id: 'file-valid', name: 'valid.pdf', size: 1024 },
          { id: 'file-stale', name: 'stale.pdf', size: 512 },
        ],
      });
      render(<RfpCreateWizard pgList={[]} />);

      await waitFor(() => {
        const { rfpFiles } = useRfpDraftStore.getState();
        expect(rfpFiles).toHaveLength(1);
        expect(rfpFiles[0].id).toBe('file-valid');
      });
      expect(verifyDraftFilesAction).toHaveBeenCalledWith(['file-valid', 'file-stale']);
      expect(toast).toHaveBeenCalledWith(
        expect.stringContaining('1개 첨부'),
        { type: 'info' },
      );
    });

    it('모든 첨부파일이 유효하면 첨부 관련 toast를 표시하지 않는다', async () => {
      vi.mocked(verifyDraftFilesAction).mockResolvedValue({ validIds: ['file-valid'] });
      useRfpDraftStore.setState({
        rfpFiles: [{ id: 'file-valid', name: 'valid.pdf', size: 1024 }],
      });
      render(<RfpCreateWizard pgList={[]} />);

      await waitFor(() => {
        expect(useRfpDraftStore.getState().rfpFiles).toHaveLength(1);
      });
      expect(toast).not.toHaveBeenCalledWith(
        expect.stringContaining('첨부'),
        expect.anything(),
      );
    });

    it('첨부파일이 없으면 verifyDraftFilesAction을 호출하지 않는다', async () => {
      render(<RfpCreateWizard pgList={[]} />);
      await waitFor(() => {});
      expect(verifyDraftFilesAction).not.toHaveBeenCalled();
    });
  });
});
