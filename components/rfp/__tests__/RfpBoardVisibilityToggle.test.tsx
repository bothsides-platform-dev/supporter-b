import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const toast = vi.fn();
vi.mock('@/lib/toast', () => ({ toast: (...a: unknown[]) => toast(...a) }));
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
const setRfpBoardVisibilityAction = vi.fn();
vi.mock('@/lib/server/actions/rfp', () => ({
  setRfpBoardVisibilityAction: (...a: unknown[]) => setRfpBoardVisibilityAction(...a),
}));

import { RfpBoardVisibilityToggle } from '../RfpBoardVisibilityToggle';

beforeEach(() => {
  toast.mockReset();
  refresh.mockReset();
  setRfpBoardVisibilityAction.mockReset();
});
afterEach(cleanup);

describe('RfpBoardVisibilityToggle', () => {
  it('hides the RFP from the board when toggled off', async () => {
    setRfpBoardVisibilityAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<RfpBoardVisibilityToggle rfpCode="P-2605-0042" boardVisible canEdit />);

    await user.click(screen.getByRole('button', { name: '숨기기' }));

    await waitFor(() =>
      expect(setRfpBoardVisibilityAction).toHaveBeenCalledWith({
        rfpId: 'P-2605-0042',
        visible: false,
      }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('renders read-only (no button) when canEdit is false', () => {
    render(<RfpBoardVisibilityToggle rfpCode="P-2605-0042" boardVisible canEdit={false} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
