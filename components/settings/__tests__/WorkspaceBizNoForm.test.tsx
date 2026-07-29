import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const toast = vi.fn();
vi.mock('@/lib/toast', () => ({ toast: (...a: unknown[]) => toast(...a) }));

const lookupBizNoAction = vi.fn();
const updateWorkspaceBizProfileAction = vi.fn();
const refresh = vi.fn();

vi.mock('@/lib/server/actions/rfp', () => ({
  lookupBizNoAction: (bizNo: string) => lookupBizNoAction(bizNo),
  updateWorkspaceBizProfileAction: (input: unknown) =>
    updateWorkspaceBizProfileAction(input),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

import { ERROR_LABELS, WorkspaceBizNoForm } from '../WorkspaceBizNoForm';

// 서버가 이 폼에 돌려줄 수 있는 코드 전부. 액션(updateWorkspaceBizProfileAction)과
// 그것이 그대로 전파하는 resolveBizProfileForWrite·requireBuyerActor 에서 온다.
// 새 코드가 서버에 생기면 여기에 추가해야 하고, 라벨이 없으면 아래 테스트가 깨진다.
const SERVER_ERROR_CODES = [
  'FORBIDDEN_NOT_ADMIN',
  'FORBIDDEN_BUYER',
  'BIZ_PROFILE_REQUIRED',
  'INVALID_INPUT',
  'BIZ_NOT_FOUND',
  'BIZ_STATUS_NOT_ACTIVE',
  'BIZ_UNSUPPORTED_TYPE',
  'BIZ_LOOKUP_UNAVAILABLE',
  'BIZ_LOOKUP_RATE_LIMITED',
] as const;

const CURRENT = '111-11-11111';

beforeEach(() => {
  toast.mockReset();
  lookupBizNoAction.mockReset();
  updateWorkspaceBizProfileAction.mockReset();
  refresh.mockReset();
});

describe('WorkspaceBizNoForm', () => {
  // 라벨 없는 코드는 일반 폴백으로 낙하한다 — 그 자체는 안전하지만, 종결 판정이
  // 낙하하면 "잠시 후 다시 시도"라는 틀린 조언이 된다. 코드 추가와 라벨 추가가
  // 같은 커밋에 묶이도록 목록 대 맵을 직접 대조한다.
  it('서버가 돌려줄 수 있는 코드에는 전부 라벨이 있다', () => {
    const unlabeled = SERVER_ERROR_CODES.filter((c) => !ERROR_LABELS[c]);
    expect(unlabeled).toEqual([]);
  });

  it('일반 멤버(canEdit=false)에게는 수정 버튼을 보이지 않는다', () => {
    // 서버가 admin 게이트로 거부하므로, 누르면 반드시 실패하는 버튼을
    // 애초에 그리지 않는다 (WorkspaceNameForm 과 동일 문법).
    render(<WorkspaceBizNoForm currentBizNo={CURRENT} canEdit={false} />);
    expect(screen.getByText(CURRENT)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '수정' })).not.toBeInTheDocument();
  });

  it('미등록 + 일반 멤버면 입력 UI 대신 관리자 안내를 보여준다', () => {
    // currentBizNo=null 은 editing 을 기본 true 로 켜므로 수정 버튼 게이트를
    // 우회한다 — 일반 멤버가 다 입력하고 저장에서만 거부당하는 막다른 길이 된다.
    render(<WorkspaceBizNoForm currentBizNo={null} canEdit={false} />);
    expect(screen.queryByLabelText('사업자 등록번호')).not.toBeInTheDocument();
    expect(screen.getByText(/관리자/)).toBeInTheDocument();
  });

  it('FORBIDDEN_NOT_ADMIN 을 사람이 읽는 문구로 보여준다', async () => {
    const user = userEvent.setup();
    lookupBizNoAction.mockResolvedValue({
      ok: true,
      valid: true,
      taxType: 'general',
      status: 'active',
    });
    updateWorkspaceBizProfileAction.mockResolvedValue({
      ok: false,
      error: 'FORBIDDEN_NOT_ADMIN',
    });

    render(<WorkspaceBizNoForm currentBizNo={CURRENT} canEdit />);
    await user.click(screen.getByRole('button', { name: '수정' }));
    await user.type(screen.getByLabelText('사업자 등록번호'), '2223334444');
    await user.click(screen.getByRole('button', { name: '조회' }));
    await waitFor(() => expect(lookupBizNoAction).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: '변경 적용' }));

    await waitFor(() => expect(toast).toHaveBeenCalled());
    const msg = String(toast.mock.calls[0][0]);
    expect(msg).not.toContain('FORBIDDEN_NOT_ADMIN');
    expect(msg).toContain('권한이 없어요');
  });

  // 매핑된 코드는 전부 사람이 읽는 문구여야 한다. FORBIDDEN_NOT_ADMIN 만 커버하면
  // 나머지 셋은 조용히 코드 원문으로 새는 채로 남는다(국세청 장애 중 저장이 실제 경로).
  it.each([
    ['FORBIDDEN_NOT_ADMIN', '권한이 없어요'],
    ['BIZ_LOOKUP_UNAVAILABLE', '국세청 조회가 어려워요'],
    ['BIZ_PROFILE_REQUIRED', '사업자번호를 먼저 입력해'],
    ['INVALID_INPUT', '입력한 내용을 다시 확인해'],
    // resolveBizProfileForWrite 의 종결 판정 — 재시도해도 절대 성공하지 않는다.
    ['BIZ_NOT_FOUND', '등록되지 않은 사업자번호'],
    ['BIZ_STATUS_NOT_ACTIVE', '폐업·휴업'],
    ['BIZ_UNSUPPORTED_TYPE', '지원되지 않는 사업자 유형'],
    // 이건 진짜로 재시도 가능한 코드 — 위 셋과 구분된다.
    ['BIZ_LOOKUP_RATE_LIMITED', '잠시 후 다시'],
  ])('%s → 코드 원문 대신 한국어 문구를 보여준다', async (code, expected) => {
    const user = userEvent.setup();
    lookupBizNoAction.mockResolvedValue({
      ok: true,
      valid: true,
      taxType: 'general',
      status: 'active',
    });
    updateWorkspaceBizProfileAction.mockResolvedValue({ ok: false, error: code });

    render(<WorkspaceBizNoForm currentBizNo={CURRENT} canEdit />);
    await user.click(screen.getByRole('button', { name: '수정' }));
    await user.type(screen.getByLabelText('사업자 등록번호'), '2223334444');
    await user.click(screen.getByRole('button', { name: '조회' }));
    await waitFor(() => expect(lookupBizNoAction).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: '변경 적용' }));

    await waitFor(() => expect(toast).toHaveBeenCalled());
    const msg = String(toast.mock.calls[0][0]);
    expect(msg).toContain(expected);
    expect(msg).not.toContain(code);
    expect(refresh).not.toHaveBeenCalled();
  });

  // 종결 판정에 "잠시 후 다시 시도" 를 붙이면 절대 성공하지 않는 동작을 반복하게
  // 만든다. 폐업 번호는 내일도 폐업이다. 일반 폴백으로 낙하하면 이 테스트가 깨진다.
  it.each(['BIZ_NOT_FOUND', 'BIZ_STATUS_NOT_ACTIVE', 'BIZ_UNSUPPORTED_TYPE'])(
    '%s 는 재시도를 권하지 않는다',
    async (code) => {
      const user = userEvent.setup();
      lookupBizNoAction.mockResolvedValue({
        ok: true,
        valid: true,
        taxType: 'general',
        status: 'active',
      });
      updateWorkspaceBizProfileAction.mockResolvedValue({ ok: false, error: code });

      render(<WorkspaceBizNoForm currentBizNo={CURRENT} canEdit />);
      await user.click(screen.getByRole('button', { name: '수정' }));
      await user.type(screen.getByLabelText('사업자 등록번호'), '2223334444');
      await user.click(screen.getByRole('button', { name: '조회' }));
      await waitFor(() => expect(lookupBizNoAction).toHaveBeenCalled());
      await user.click(screen.getByRole('button', { name: '변경 적용' }));

      await waitFor(() => expect(toast).toHaveBeenCalled());
      expect(String(toast.mock.calls[0][0])).not.toContain('잠시 후 다시');
    },
  );

  it('shows the current bizNo and a 수정 button initially', () => {
    render(<WorkspaceBizNoForm currentBizNo={CURRENT} canEdit />);
    expect(screen.getByText(CURRENT)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '수정' })).toBeInTheDocument();
    expect(
      screen.queryByLabelText('사업자 등록번호'),
    ).not.toBeInTheDocument();
  });

  it('reveals the lookup field after clicking 수정', async () => {
    const user = userEvent.setup();
    render(<WorkspaceBizNoForm currentBizNo={CURRENT} canEdit />);

    await user.click(screen.getByRole('button', { name: '수정' }));
    expect(screen.getByLabelText('사업자 등록번호')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '취소' })).toBeInTheDocument();
  });

  it('cancels back to read-only state without calling any action', async () => {
    const user = userEvent.setup();
    render(<WorkspaceBizNoForm currentBizNo={CURRENT} canEdit />);

    await user.click(screen.getByRole('button', { name: '수정' }));
    await user.click(screen.getByRole('button', { name: '취소' }));

    expect(
      screen.queryByLabelText('사업자 등록번호'),
    ).not.toBeInTheDocument();
    expect(screen.getByText(CURRENT)).toBeInTheDocument();
    expect(updateWorkspaceBizProfileAction).not.toHaveBeenCalled();
  });

  it('submits the verified new bizNo and refreshes on success', async () => {
    const user = userEvent.setup();
    lookupBizNoAction.mockResolvedValue({
      ok: true,
      valid: true,
      taxType: 'general',
      status: 'active',
    });
    updateWorkspaceBizProfileAction.mockResolvedValue({
      ok: true,
      bizProfileId: 'biz-2',
    });

    render(<WorkspaceBizNoForm currentBizNo={CURRENT} canEdit />);
    await user.click(screen.getByRole('button', { name: '수정' }));

    await user.type(screen.getByLabelText('사업자 등록번호'), '2223334444');
    await user.click(screen.getByRole('button', { name: '조회' }));

    await waitFor(() =>
      expect(lookupBizNoAction).toHaveBeenCalledWith('222-33-34444'),
    );

    await user.click(screen.getByRole('button', { name: '변경 적용' }));

    await waitFor(() =>
      expect(updateWorkspaceBizProfileAction).toHaveBeenCalledWith({
        bizProfile: {
          bizNo: '222-33-34444',
          taxType: 'general',
          status: 'active',
        },
      }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    await waitFor(() => expect(toast).toHaveBeenCalledWith('사업자번호를 저장했어요.'));
    // No inline "✓ 저장됨" text
    expect(screen.queryByText(/저장됨/)).toBeNull();
  });

  // 비영리법인·고유번호 단체 등 taxType 미매핑 케이스 — 저장 액션의 z.enum 이
  // 거부하므로 조회 단계에서 선차단되어야 한다 (원인 불명 INVALID_INPUT 방지).
  it('지원되지 않는 사업자 유형(taxType 미매핑)은 확인 처리하지 않고 안내한다', async () => {
    const user = userEvent.setup();
    lookupBizNoAction.mockResolvedValue({
      ok: true,
      valid: true,
      taxType: undefined,
      status: 'active',
    });

    render(<WorkspaceBizNoForm currentBizNo={CURRENT} canEdit />);
    await user.click(screen.getByRole('button', { name: '수정' }));

    await user.type(screen.getByLabelText('사업자 등록번호'), '2223334444');
    await user.click(screen.getByRole('button', { name: '조회' }));

    expect(
      await screen.findByText(/지원되지 않는 사업자 유형이에요/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '변경 적용' })).toBeDisabled();
    expect(updateWorkspaceBizProfileAction).not.toHaveBeenCalled();
  });

  it('disables 변경 적용 when the looked-up bizNo equals the current one', async () => {
    const user = userEvent.setup();
    lookupBizNoAction.mockResolvedValue({
      ok: true,
      valid: true,
      taxType: 'general',
      status: 'active',
    });

    render(<WorkspaceBizNoForm currentBizNo={CURRENT} canEdit />);
    await user.click(screen.getByRole('button', { name: '수정' }));

    await user.type(
      screen.getByLabelText('사업자 등록번호'),
      CURRENT.replace(/-/g, ''),
    );
    await user.click(screen.getByRole('button', { name: '조회' }));

    await waitFor(() =>
      expect(lookupBizNoAction).toHaveBeenCalledWith(CURRENT),
    );

    expect(
      await screen.findByText(/현재 사업자번호와 동일/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '변경 적용' }),
    ).toBeDisabled();
  });

  it('shows 사업자 등록번호 label exactly once when editing (no duplicate from outer Label)', async () => {
    // Regression: ISSUE-001 — duplicate "사업자 등록번호" label rendered when edit mode active
    // Found by /qa on 2026-05-31
    // Report: .gstack/qa-reports/qa-report-localhost-2026-05-31.md
    const user = userEvent.setup();
    render(<WorkspaceBizNoForm currentBizNo={CURRENT} canEdit />);

    await user.click(screen.getByRole('button', { name: '수정' }));

    // BizLookupField renders its own label; the outer Label must not render in edit mode
    expect(screen.getAllByText('사업자 등록번호')).toHaveLength(1);
  });

  it('renders in initial-registration mode when currentBizNo is null', async () => {
    render(<WorkspaceBizNoForm currentBizNo={null} canEdit />);
    // 수정 버튼 없이 곧장 입력 필드 노출.
    expect(screen.queryByRole('button', { name: '수정' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('사업자 등록번호')).toBeInTheDocument();
    // CTA 라벨도 등록 문구로 — 취소 버튼은 등록 모드에서 숨김.
    expect(
      screen.getByRole('button', { name: '사업자번호 등록' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '취소' })).not.toBeInTheDocument();
  });

  it('shows the action error and does not refresh on failure', async () => {
    const user = userEvent.setup();
    lookupBizNoAction.mockResolvedValue({
      ok: true,
      valid: true,
      taxType: 'simple',
      status: 'active',
    });
    updateWorkspaceBizProfileAction.mockResolvedValue({
      ok: false,
      error: 'WORKSPACE_NOT_FOUND',
    });

    render(<WorkspaceBizNoForm currentBizNo={CURRENT} canEdit />);
    await user.click(screen.getByRole('button', { name: '수정' }));

    await user.type(screen.getByLabelText('사업자 등록번호'), '2223334444');
    await user.click(screen.getByRole('button', { name: '조회' }));
    await waitFor(() => expect(lookupBizNoAction).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: '변경 적용' }));

    // 매핑 없는 코드는 일반 문구로 낙하한다 — 내부 코드는 사용자에게 노출하지 않는다.
    // `expect.any(String)` 으로 두면 빈 문자열 토스트도 통과하므로 실문구를 박는다.
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('저장하지 못했어요'), {
      type: 'error',
    });
    expect(String(toast.mock.calls[0][0])).not.toContain('WORKSPACE_NOT_FOUND');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  // 가입 폼(BuyerWorkspaceForm)은 폐업·휴업 사업자를 blockedStatuses 로 막는데
  // 설정의 변경 폼은 그 prop 없이 BizLookupField 를 써서, 정상 사업자로 가입한
  // 뒤 폐업 번호로 갈아끼우는 경로가 열려 있었다.
  it.each([
    ['closed', '폐업'] as const,
    ['suspended', '휴업'] as const,
  ])('폐업·휴업(%s) 사업자번호로는 변경할 수 없다', async (status, label) => {
    const user = userEvent.setup();
    lookupBizNoAction.mockResolvedValue({
      ok: true,
      valid: true,
      taxType: 'general',
      status,
    });

    render(<WorkspaceBizNoForm currentBizNo={CURRENT} canEdit />);
    await user.click(screen.getByRole('button', { name: '수정' }));

    await user.type(screen.getByLabelText('사업자 등록번호'), '2223334444');
    await user.click(screen.getByRole('button', { name: '조회' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      new RegExp(`${label} 상태인 사업자`),
    );
    expect(screen.getByRole('button', { name: '변경 적용' })).toBeDisabled();
    expect(updateWorkspaceBizProfileAction).not.toHaveBeenCalled();
  });

  it('최초 등록 모드에서도 폐업 사업자번호는 등록할 수 없다', async () => {
    const user = userEvent.setup();
    lookupBizNoAction.mockResolvedValue({
      ok: true,
      valid: true,
      taxType: 'general',
      status: 'closed',
    });

    render(<WorkspaceBizNoForm currentBizNo={null} canEdit />);
    await user.type(screen.getByLabelText('사업자 등록번호'), '2223334444');
    await user.click(screen.getByRole('button', { name: '조회' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '사업자번호 등록' })).toBeDisabled();
    expect(updateWorkspaceBizProfileAction).not.toHaveBeenCalled();
  });

  it('NTS 조회 실패 시 "찾지 못했어요"가 아닌 오류 메시지를 표시한다', async () => {
    const user = userEvent.setup();
    lookupBizNoAction.mockResolvedValue({ ok: false, error: 'NTS_NETWORK' });

    render(<WorkspaceBizNoForm currentBizNo={null} canEdit />);
    await user.type(screen.getByLabelText('사업자 등록번호'), '1234567890');
    await user.click(screen.getByRole('button', { name: '조회' }));

    expect(
      await screen.findByText(/잠시 후 다시 시도해주세요/),
    ).toBeInTheDocument();
    expect(screen.queryByText('조회 중…')).not.toBeInTheDocument();
    expect(screen.queryByText(/찾지 못했어요/)).not.toBeInTheDocument();
  });
});
