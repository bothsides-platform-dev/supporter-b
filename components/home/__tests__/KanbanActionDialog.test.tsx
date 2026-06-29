import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

const withdrawBid = vi.fn();

vi.mock('@/lib/server/actions/bid/withdrawBidAction', () => ({
  withdrawBidAction: (i: unknown) => withdrawBid(i),
}));
vi.mock('@/lib/toast', () => ({ toast: vi.fn() }));

import { KanbanActionDialog } from '../KanbanActionDialog';

afterEach(() => {
  cleanup();
  withdrawBid.mockReset();
});

describe('KanbanActionDialog', () => {
  it('renders nothing when action is null', () => {
    const { container } = render(
      <KanbanActionDialog action={null} onClose={vi.fn()} onCommitted={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the withdraw-bid dialog with 철회 button', () => {
    render(
      <KanbanActionDialog
        action={{ kind: 'withdraw-bid', bidId: 'b1', rfpId: 'r1', title: 'Test RFP' }}
        onClose={vi.fn()}
        onCommitted={vi.fn()}
      />,
    );
    expect(screen.getByText('보낸 견적을 철회할까요?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '철회' })).toBeInTheDocument();
  });

  it('calls onClose on cancel without triggering any action', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <KanbanActionDialog
        action={{ kind: 'withdraw-bid', bidId: 'b1', rfpId: 'r1', title: 'Test RFP' }}
        onClose={onClose}
        onCommitted={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: '돌아가기' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(withdrawBid).not.toHaveBeenCalled();
  });
});
