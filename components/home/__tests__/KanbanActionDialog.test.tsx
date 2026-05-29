import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

const cancelRfp = vi.fn();
const withdrawBid = vi.fn();

vi.mock('@/lib/server/actions/rfp/cancelRfpAction', () => ({
  cancelRfpAction: (i: unknown) => cancelRfp(i),
}));
vi.mock('@/lib/server/actions/bid/withdrawBidAction', () => ({
  withdrawBidAction: (i: unknown) => withdrawBid(i),
}));
vi.mock('@/lib/toast', () => ({ toast: vi.fn() }));

import { KanbanActionDialog } from '../KanbanActionDialog';

afterEach(() => {
  cleanup();
  cancelRfp.mockReset();
  withdrawBid.mockReset();
});

describe('KanbanActionDialog', () => {
  it('renders nothing when action is null', () => {
    const { container } = render(
      <KanbanActionDialog action={null} onClose={vi.fn()} onCommitted={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the cancel-rfp dialog with 취소 처리 button', () => {
    render(
      <KanbanActionDialog
        action={{ kind: 'cancel-rfp', rfpId: 'r1', title: 'Test RFP' }}
        onClose={vi.fn()}
        onCommitted={vi.fn()}
      />,
    );
    expect(screen.getByText('RFP를 취소(종료)할까요?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '취소 처리' })).toBeInTheDocument();
  });

  it('shows the withdraw-bid dialog with 철회 button', () => {
    render(
      <KanbanActionDialog
        action={{ kind: 'withdraw-bid', bidId: 'b1', rfpId: 'r1', title: 'Test RFP' }}
        onClose={vi.fn()}
        onCommitted={vi.fn()}
      />,
    );
    expect(screen.getByText('제출한 제안을 철회할까요?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '철회' })).toBeInTheDocument();
  });

  it('calls cancelRfpAction and onCommitted on confirm for cancel-rfp', async () => {
    const user = userEvent.setup();
    const onCommitted = vi.fn();
    cancelRfp.mockResolvedValue({ ok: true });

    render(
      <KanbanActionDialog
        action={{ kind: 'cancel-rfp', rfpId: 'r1', title: 'Test RFP' }}
        onClose={vi.fn()}
        onCommitted={onCommitted}
      />,
    );
    await user.click(screen.getByRole('button', { name: '취소 처리' }));
    await waitFor(() => expect(onCommitted).toHaveBeenCalledOnce());
    expect(cancelRfp).toHaveBeenCalledWith({ rfpId: 'r1' });
  });

  it('calls onClose on cancel without triggering any action', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <KanbanActionDialog
        action={{ kind: 'cancel-rfp', rfpId: 'r1', title: 'Test RFP' }}
        onClose={onClose}
        onCommitted={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: '돌아가기' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(cancelRfp).not.toHaveBeenCalled();
  });
});
