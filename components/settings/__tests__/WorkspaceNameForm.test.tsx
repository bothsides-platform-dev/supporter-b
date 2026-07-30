import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const toast = vi.fn();
vi.mock('@/lib/toast', () => ({ toast: (...a: unknown[]) => toast(...a) }));

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const renameWorkspaceAction = vi.fn();
vi.mock('@/lib/server/actions/workspace/renameWorkspaceAction', () => ({
  renameWorkspaceAction: (...a: unknown[]) => renameWorkspaceAction(...a),
}));

import { WorkspaceNameForm } from '../WorkspaceNameForm';

beforeEach(() => {
  toast.mockReset();
  refresh.mockReset();
  renameWorkspaceAction.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('WorkspaceNameForm', () => {
  it('shows toast on successful rename', async () => {
    renameWorkspaceAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();

    render(<WorkspaceNameForm currentName="테스트 회사" canEdit />);

    await user.click(screen.getByRole('button', { name: '수정' }));
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, '새 이름');
    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(toast).toHaveBeenCalledWith('이름을 변경했어요.'));
    expect(toast).not.toHaveBeenCalledWith(expect.anything(), { type: 'error' });
  });

  it('shows error toast and does not show inline error when rename fails', async () => {
    renameWorkspaceAction.mockResolvedValue({ ok: false, error: 'FORBIDDEN' });
    const user = userEvent.setup();

    render(<WorkspaceNameForm currentName="테스트 회사" canEdit />);

    await user.click(screen.getByRole('button', { name: '수정' }));
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, '새 이름');
    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith('권한이 없어요.', { type: 'error' }),
    );
    // No inline error paragraph
    expect(screen.queryByRole('alert')).toBeNull();
  });

  // v0.4.34.0 이전에는 미매핑 코드를 `?? r.error` 로 그대로 토스트에 띄웠다 —
  // 같은 패널의 다른 두 폼과 정책이 달랐고, 사용자에게 내부 enum 이 노출됐다.
  // 폴백은 (ⓐ 코드를 흘리지 않고 ⓑ 한국어 안내를 주고 ⓒ 새로고침하지 않아야) 한다.
  it('사전에 없는 코드는 원문 대신 일반 안내로 떨어진다', async () => {
    renameWorkspaceAction.mockResolvedValue({ ok: false, error: 'WORKSPACE_SUSPENDED' });
    const user = userEvent.setup();

    render(<WorkspaceNameForm currentName="테스트 회사" canEdit />);

    await user.click(screen.getByRole('button', { name: '수정' }));
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, '새 이름');
    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('저장하지 못했어요'), {
      type: 'error',
    });
    expect(String(toast.mock.calls[0][0])).not.toContain('WORKSPACE_SUSPENDED');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('does not render 수정 button when canEdit is false', () => {
    render(<WorkspaceNameForm currentName="테스트 회사" canEdit={false} />);
    expect(screen.queryByRole('button', { name: '수정' })).toBeNull();
  });

  it('uses shared Field: label is linked to the input via htmlFor when editing', async () => {
    const user = userEvent.setup();
    render(<WorkspaceNameForm currentName="테스트 회사" canEdit />);
    await user.click(screen.getByRole('button', { name: '수정' }));

    const label = screen.getByText('이름');
    expect(label.tagName).toBe('LABEL');
    expect(label).toHaveAttribute('for', 'workspace-name-input');
    expect(screen.getByRole('textbox', { name: '이름' })).toBeDefined();
  });
});
