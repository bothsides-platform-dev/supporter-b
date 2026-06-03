import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const toast = vi.fn();
vi.mock('@/lib/toast', () => ({ toast: (...a: unknown[]) => toast(...a) }));

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const createPgRequestAction = vi.fn();
vi.mock('@/lib/server/actions/rfp', () => ({
  createPgRequestAction: (...a: unknown[]) => createPgRequestAction(...a),
}));

import { OpportunityRequestDialog } from '../OpportunityRequestDialog';

beforeEach(() => {
  toast.mockReset();
  refresh.mockReset();
  createPgRequestAction.mockReset();
});
afterEach(() => cleanup());

describe('OpportunityRequestDialog', () => {
  it('submits the pitch and shows a success toast + refresh on ok', async () => {
    createPgRequestAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<OpportunityRequestDialog rfpCode="P-2605-0001" />);

    await user.click(screen.getByRole('button', { name: '참여 요청' }));
    await user.type(screen.getByRole('textbox'), '제안 드리고 싶어요.');
    await user.click(screen.getByRole('button', { name: '보내기' }));

    await waitFor(() =>
      expect(createPgRequestAction).toHaveBeenCalledWith({
        rfpId: 'P-2605-0001',
        message: '제안 드리고 싶어요.',
      }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('요청'));
  });

  it('shows an error toast and does not refresh when the action fails', async () => {
    createPgRequestAction.mockResolvedValue({ ok: false, error: 'ALREADY_REQUESTED' });
    const user = userEvent.setup();
    render(<OpportunityRequestDialog rfpCode="P-2605-0002" />);

    await user.click(screen.getByRole('button', { name: '참여 요청' }));
    await user.type(screen.getByRole('textbox'), '다시 제안합니다.');
    await user.click(screen.getByRole('button', { name: '보내기' }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.any(String), { type: 'error' }),
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
