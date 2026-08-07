import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

const awardRfpAction = vi.fn();
vi.mock('@/lib/server/actions/rfp', () => ({
  awardRfpAction: (...a: unknown[]) => awardRfpAction(...a),
}));

import { AwardConfirmDialog } from '../AwardConfirmDialog';

beforeEach(() => {
  awardRfpAction.mockReset();
});
afterEach(cleanup);

function renderDialog(over: Partial<Parameters<typeof AwardConfirmDialog>[0]> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    rfpId: 'rfp-uuid-1',
    awardedBidId: 'bid-1',
    pgName: '토스페이먼츠',
    otherCount: 3,
    onAwarded: vi.fn(),
    ...over,
  };
  render(<AwardConfirmDialog {...props} />);
  return props;
}

describe('AwardConfirmDialog', () => {
  it('shows the selected PG name and the number of PGs that will be notified as not selected', () => {
    renderDialog();
    expect(screen.getByRole('heading', { name: /토스페이먼츠/ })).toBeInTheDocument();
    expect(screen.getByText(/미선정 PG 3곳/)).toBeInTheDocument();
  });

  it('awards the selected bid and notifies the parent on success', async () => {
    awardRfpAction.mockResolvedValue({ ok: true });
    const onAwarded = vi.fn();
    renderDialog({ onAwarded });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '선정할게요' }));

    expect(awardRfpAction).toHaveBeenCalledWith({
      rfpId: 'rfp-uuid-1',
      awardedBidId: 'bid-1',
    });
    await waitFor(() => expect(onAwarded).toHaveBeenCalled());
  });

  it('surfaces the error and does not notify the parent when the action fails', async () => {
    awardRfpAction.mockResolvedValue({ ok: false, error: '마감된 견적 요청' });
    const onAwarded = vi.fn();
    renderDialog({ onAwarded });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '선정할게요' }));

    expect(await screen.findByText(/마감된 견적 요청/)).toBeInTheDocument();
    expect(onAwarded).not.toHaveBeenCalled();
  });

  it('closes without awarding when cancelled', async () => {
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '닫기' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(awardRfpAction).not.toHaveBeenCalled();
  });
});
