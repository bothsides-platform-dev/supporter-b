import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
const save = vi.hoisted(() => vi.fn());
vi.mock('@/lib/server/actions/user/updateBusinessAlimtalkAction', () => ({
  updateBusinessAlimtalkAction: save,
}));
import { BusinessAlimtalkSettings } from '../BusinessAlimtalkSettings';
afterEach(() => {
  cleanup();
  save.mockReset();
});
it('saves opt-out and restores the stored state on reentry', async () => {
  save.mockResolvedValue({ ok: true });
  const user = userEvent.setup();
  const view = render(
    <BusinessAlimtalkSettings enabled maskedPhone="010-****-5678" />,
  );
  expect(screen.getByRole('switch')).toBeChecked();
  await user.click(screen.getByRole('switch'));
  await waitFor(() => expect(screen.getByRole('switch')).not.toBeChecked());
  expect(save).toHaveBeenCalledWith({ enabled: false });
  view.unmount();
  render(
    <BusinessAlimtalkSettings enabled={false} maskedPhone="010-****-5678" />,
  );
  expect(screen.getByRole('switch')).not.toBeChecked();
  expect(screen.getByRole('link', { name: /휴대폰/ })).toHaveAttribute(
    'href',
    '/settings/profile',
  );
});
it.each(['rejected', 'throw'])(
  'keeps the saved setting and shows an actionable failure (%s)',
  async (mode) => {
    if (mode === 'throw') save.mockRejectedValue(new Error('network'));
    else save.mockResolvedValue({ ok: false, error: 'SAVE_FAILED' });
    render(<BusinessAlimtalkSettings enabled maskedPhone={null} />);
    await userEvent.setup().click(screen.getByRole('switch'));
    expect(await screen.findByRole('alert')).toHaveTextContent('다시');
    expect(screen.getByRole('switch')).toBeChecked();
    expect(screen.getByRole('switch')).not.toBeDisabled();
  },
);
