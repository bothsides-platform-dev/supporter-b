import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const toast = vi.fn();
vi.mock('@/lib/toast', () => ({ toast: (...a: unknown[]) => toast(...a) }));

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const updateWorkspaceBizProfileAction = vi.fn();
vi.mock('@/lib/server/actions/rfp', () => ({
  updateWorkspaceBizProfileAction: (...a: unknown[]) => updateWorkspaceBizProfileAction(...a),
}));

import { WorkspaceBizProfileForm } from '../WorkspaceBizProfileForm';

beforeEach(() => {
  toast.mockReset();
  refresh.mockReset();
  updateWorkspaceBizProfileAction.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('WorkspaceBizProfileForm', () => {
  it('shows success toast after grade update', async () => {
    updateWorkspaceBizProfileAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();

    render(<WorkspaceBizProfileForm currentGrade="sme2" />);

    // Change grade from sme2 to general
    await user.click(screen.getByRole('radio', { name: /일반/ }));
    await user.click(screen.getByRole('button', { name: '등급 갱신' }));

    await waitFor(() => expect(toast).toHaveBeenCalledWith('가맹점 등급을 변경했습니다.'));
    expect(toast).not.toHaveBeenCalledWith(expect.anything(), { type: 'error' });
  });

  it('shows error toast and no inline error when update fails', async () => {
    updateWorkspaceBizProfileAction.mockResolvedValue({ ok: false, error: 'FORBIDDEN' });
    const user = userEvent.setup();

    render(<WorkspaceBizProfileForm currentGrade="sme2" />);

    await user.click(screen.getByRole('radio', { name: /일반/ }));
    await user.click(screen.getByRole('button', { name: '등급 갱신' }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.any(String), { type: 'error' }),
    );
    // No inline error or savedAt text
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/저장됨/)).toBeNull();
  });

  it('does not show savedAt inline text on success', async () => {
    updateWorkspaceBizProfileAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();

    render(<WorkspaceBizProfileForm currentGrade="sme2" />);

    await user.click(screen.getByRole('radio', { name: /일반/ }));
    await user.click(screen.getByRole('button', { name: '등급 갱신' }));

    await waitFor(() => expect(toast).toHaveBeenCalled());
    // No inline "✓ 저장됨" text
    expect(screen.queryByText(/저장됨/)).toBeNull();
  });
});
