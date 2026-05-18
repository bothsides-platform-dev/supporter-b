import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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

import { WorkspaceBizNoForm } from '../WorkspaceBizNoForm';

const CURRENT = '111-11-11111';

beforeEach(() => {
  lookupBizNoAction.mockReset();
  updateWorkspaceBizProfileAction.mockReset();
  refresh.mockReset();
});

describe('WorkspaceBizNoForm', () => {
  it('shows the current bizNo and a 수정 button initially', () => {
    render(<WorkspaceBizNoForm currentBizNo={CURRENT} />);
    expect(screen.getByText(CURRENT)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '수정' })).toBeInTheDocument();
    expect(
      screen.queryByLabelText('사업자 등록번호'),
    ).not.toBeInTheDocument();
  });

  it('reveals the lookup field after clicking 수정', async () => {
    const user = userEvent.setup();
    render(<WorkspaceBizNoForm currentBizNo={CURRENT} />);

    await user.click(screen.getByRole('button', { name: '수정' }));
    expect(screen.getByLabelText('사업자 등록번호')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '취소' })).toBeInTheDocument();
  });

  it('cancels back to read-only state without calling any action', async () => {
    const user = userEvent.setup();
    render(<WorkspaceBizNoForm currentBizNo={CURRENT} />);

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

    render(<WorkspaceBizNoForm currentBizNo={CURRENT} />);
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
    expect(await screen.findByText(/저장됨/)).toBeInTheDocument();
  });

  it('disables 변경 적용 when the looked-up bizNo equals the current one', async () => {
    const user = userEvent.setup();
    lookupBizNoAction.mockResolvedValue({
      ok: true,
      valid: true,
      taxType: 'general',
      status: 'active',
    });

    render(<WorkspaceBizNoForm currentBizNo={CURRENT} />);
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

  it('renders in initial-registration mode when currentBizNo is null', async () => {
    render(<WorkspaceBizNoForm currentBizNo={null} />);
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

    render(<WorkspaceBizNoForm currentBizNo={CURRENT} />);
    await user.click(screen.getByRole('button', { name: '수정' }));

    await user.type(screen.getByLabelText('사업자 등록번호'), '2223334444');
    await user.click(screen.getByRole('button', { name: '조회' }));
    await waitFor(() => expect(lookupBizNoAction).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: '변경 적용' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /WORKSPACE_NOT_FOUND/,
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
